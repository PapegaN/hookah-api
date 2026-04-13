import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersController } from './orders.controller';

@Module({
  imports: [AuthModule],
  controllers: [OrdersController],
})
export class OrdersModule {}
