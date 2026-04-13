import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PlatformModule } from './modules/platform/platform.module';
import { ReferencesModule } from './modules/references/references.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
    }),
    PlatformModule,
    AuthModule,
    HealthModule,
    UsersModule,
    ReferencesModule,
    OrdersModule,
  ],
})
export class AppModule {}
