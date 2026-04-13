import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

interface LoginResponseBody {
  accessToken: string;
  user: {
    id: string;
    login: string;
    role: string;
  };
}

interface ReferencesResponseBody {
  tobaccos: Array<{ id: string }>;
}

interface OrderResponseBody {
  id: string;
  status: string;
  description: string;
  requestedTobaccos: Array<{ id: string }>;
  actualTobaccos: Array<{ id: string }>;
  acceptedBy?: {
    login: string;
  };
  ratingScore?: number;
  ratingReview?: string;
}

describe('API (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/api/v1/health (GET)', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(httpServer)
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'hookah-api',
    });
  });

  it('allows admin login and references loading', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const loginResponse = await request(httpServer)
      .post('/api/v1/auth/login')
      .send({
        login: 'admin',
        password: 'admin',
      })
      .expect(201);

    const loginBody = loginResponse.body as LoginResponseBody;

    expect(loginBody.user).toMatchObject({
      login: 'admin',
      role: 'admin',
    });
    expect(typeof loginBody.accessToken).toBe('string');

    const referencesResponse = await request(httpServer)
      .get('/api/v1/references')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .expect(200);
    const referencesBody = referencesResponse.body as ReferencesResponseBody;

    expect(Array.isArray(referencesBody.tobaccos)).toBe(true);
    expect(referencesBody.tobaccos.length).toBeGreaterThan(0);
  });

  it('runs the client to master feedback order flow', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const adminLoginResponse = await request(httpServer)
      .post('/api/v1/auth/login')
      .send({
        login: 'admin',
        password: 'admin',
      })
      .expect(201);
    const adminBody = adminLoginResponse.body as LoginResponseBody;

    const catalogResponse = await request(httpServer)
      .get('/api/v1/references')
      .set('Authorization', `Bearer ${adminBody.accessToken}`)
      .expect(200);
    const catalogBody = catalogResponse.body as ReferencesResponseBody;
    const tobaccoIds = catalogBody.tobaccos.slice(0, 2).map((item) => item.id);

    expect(tobaccoIds).toHaveLength(2);

    const clientLoginResponse = await request(httpServer)
      .post('/api/v1/auth/login')
      .send({
        login: 'client',
        password: 'client',
      })
      .expect(201);
    const clientBody = clientLoginResponse.body as LoginResponseBody;

    const createOrderResponse = await request(httpServer)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${clientBody.accessToken}`)
      .send({
        description: 'Хочу ягодный микс с холодком.',
        requestedTobaccoIds: tobaccoIds,
      })
      .expect(201);
    const createdOrderBody = createOrderResponse.body as OrderResponseBody;

    expect(createdOrderBody.status).toBe('new');
    expect(createdOrderBody.requestedTobaccos).toHaveLength(2);

    const masterLoginResponse = await request(httpServer)
      .post('/api/v1/auth/login')
      .send({
        login: 'master',
        password: 'master',
      })
      .expect(201);
    const masterBody = masterLoginResponse.body as LoginResponseBody;

    const startedOrderResponse = await request(httpServer)
      .patch(`/api/v1/orders/${createdOrderBody.id}/start`)
      .set('Authorization', `Bearer ${masterBody.accessToken}`)
      .expect(200);
    const startedOrderBody = startedOrderResponse.body as OrderResponseBody;

    expect(startedOrderBody.status).toBe('in_progress');
    expect(startedOrderBody.acceptedBy?.login).toBe('master');

    const fulfilledOrderResponse = await request(httpServer)
      .patch(`/api/v1/orders/${createdOrderBody.id}/fulfill`)
      .set('Authorization', `Bearer ${masterBody.accessToken}`)
      .send({
        actualTobaccoIds: tobaccoIds,
        packingComment: 'Сделал мягче и добавил больше холода.',
      })
      .expect(200);
    const fulfilledOrderBody = fulfilledOrderResponse.body as OrderResponseBody;

    expect(fulfilledOrderBody.status).toBe('ready_for_feedback');
    expect(fulfilledOrderBody.actualTobaccos).toHaveLength(2);

    const feedbackResponse = await request(httpServer)
      .patch(`/api/v1/orders/${createdOrderBody.id}/feedback`)
      .set('Authorization', `Bearer ${clientBody.accessToken}`)
      .send({
        ratingScore: 5,
        ratingReview: 'Очень понравилось, хороший баланс.',
      })
      .expect(200);
    const feedbackBody = feedbackResponse.body as OrderResponseBody;

    expect(feedbackBody.status).toBe('rated');
    expect(feedbackBody.ratingScore).toBe(5);
    expect(feedbackBody.ratingReview).toContain('Очень понравилось');
  });

  afterEach(async () => {
    await app.close();
  });
});
