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
    isApproved: boolean;
  };
}

interface ReferencesResponseBody {
  tobaccos: Array<{ id: string }>;
}

interface OrderResponseBody {
  id: string;
  tableLabel: string;
  status: string;
  participants: Array<{
    client: {
      login: string;
    };
    tableApprovalStatus: string;
    feedback?: {
      ratingScore: number;
      submittedAt: string;
    };
  }>;
  requestedTobaccos: Array<{ id: string }>;
  actualTobaccos: Array<{ id: string }>;
  feedbacks: Array<{
    client: {
      login: string;
    };
    ratingScore: number;
  }>;
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

  it('runs a shared table order flow for multiple clients', async () => {
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

    const firstOrderResponse = await request(httpServer)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${clientBody.accessToken}`)
      .send({
        tableLabel: 'Table 1',
        description: 'Berry mix with cooling.',
        requestedTobaccoIds: tobaccoIds,
      })
      .expect(201);
    const firstOrderBody = firstOrderResponse.body as OrderResponseBody;

    expect(firstOrderBody.status).toBe('new');
    expect(firstOrderBody.tableLabel).toBe('Table 1');
    expect(firstOrderBody.participants).toHaveLength(1);

    const secondClientRegisterResponse = await request(httpServer)
      .post('/api/v1/auth/register')
      .send({
        login: 'tablemate',
        password: 'tablemate',
      })
      .expect(201);
    const secondClientBody =
      secondClientRegisterResponse.body as LoginResponseBody;

    expect(secondClientBody.user.isApproved).toBe(false);

    await request(httpServer)
      .patch(`/api/v1/users/${secondClientBody.user.id}`)
      .set('Authorization', `Bearer ${adminBody.accessToken}`)
      .send({
        isApproved: true,
      })
      .expect(200);

    const secondOrderResponse = await request(httpServer)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${secondClientBody.accessToken}`)
      .send({
        tableLabel: 'Table 1',
        description: 'Want it softer and sweeter.',
        requestedTobaccoIds: tobaccoIds,
      })
      .expect(201);
    const secondOrderBody = secondOrderResponse.body as OrderResponseBody;

    expect(secondOrderBody.id).toBe(firstOrderBody.id);
    expect(secondOrderBody.participants).toHaveLength(2);
    expect(secondOrderBody.participants[1]?.tableApprovalStatus).toBe(
      'pending',
    );

    const masterLoginResponse = await request(httpServer)
      .post('/api/v1/auth/login')
      .send({
        login: 'master',
        password: 'master',
      })
      .expect(201);
    const masterBody = masterLoginResponse.body as LoginResponseBody;

    const approvedParticipantResponse = await request(httpServer)
      .patch(
        `/api/v1/orders/${firstOrderBody.id}/participants/${secondClientBody.user.id}/approve-table`,
      )
      .set('Authorization', `Bearer ${masterBody.accessToken}`)
      .expect(200);
    const approvedParticipantBody =
      approvedParticipantResponse.body as OrderResponseBody;

    expect(approvedParticipantBody.participants[1]?.tableApprovalStatus).toBe(
      'approved',
    );

    const startedOrderResponse = await request(httpServer)
      .patch(`/api/v1/orders/${firstOrderBody.id}/start`)
      .set('Authorization', `Bearer ${masterBody.accessToken}`)
      .expect(200);
    const startedOrderBody = startedOrderResponse.body as OrderResponseBody;

    expect(startedOrderBody.status).toBe('in_progress');

    const fulfilledOrderResponse = await request(httpServer)
      .patch(`/api/v1/orders/${firstOrderBody.id}/fulfill`)
      .set('Authorization', `Bearer ${masterBody.accessToken}`)
      .send({
        actualTobaccoIds: tobaccoIds,
        packingComment: 'Balanced the bowl for the whole table.',
      })
      .expect(200);
    const fulfilledOrderBody = fulfilledOrderResponse.body as OrderResponseBody;

    expect(fulfilledOrderBody.status).toBe('ready_for_feedback');
    expect(fulfilledOrderBody.actualTobaccos).toHaveLength(2);

    const firstFeedbackResponse = await request(httpServer)
      .patch(`/api/v1/orders/${firstOrderBody.id}/feedback`)
      .set('Authorization', `Bearer ${clientBody.accessToken}`)
      .send({
        ratingScore: 5,
        ratingReview: 'Great balance.',
      })
      .expect(200);
    const firstFeedbackBody = firstFeedbackResponse.body as OrderResponseBody;

    expect(firstFeedbackBody.status).toBe('ready_for_feedback');
    expect(firstFeedbackBody.feedbacks).toHaveLength(1);

    const secondFeedbackResponse = await request(httpServer)
      .patch(`/api/v1/orders/${firstOrderBody.id}/feedback`)
      .set('Authorization', `Bearer ${secondClientBody.accessToken}`)
      .send({
        ratingScore: 4,
        ratingReview: 'Nice and soft.',
      })
      .expect(200);
    const secondFeedbackBody = secondFeedbackResponse.body as OrderResponseBody;

    expect(secondFeedbackBody.status).toBe('rated');
    expect(secondFeedbackBody.feedbacks).toHaveLength(2);
  });

  afterEach(async () => {
    await app.close();
  });
});
