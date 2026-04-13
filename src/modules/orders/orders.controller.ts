import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppUser } from '../platform/platform.models';
import { UserRole } from '../platform/platform.models';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { DemoAuthGuard } from '../auth/guards/demo-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformDataService } from '../platform/platform-data.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { FulfillOrderDto } from './dto/fulfill-order.dto';
import { SubmitOrderFeedbackDto } from './dto/submit-order-feedback.dto';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller({
  path: 'orders',
  version: '1',
})
@UseGuards(DemoAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly platformDataService: PlatformDataService) {}

  @Get()
  @ApiOperation({
    summary:
      'Получить список заказов: все для администратора и мастера, только свои для клиента',
  })
  async listOrders(@CurrentUser() user: AppUser) {
    return this.platformDataService.listOrdersForUser(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить детальную карточку заказа' })
  async getOrder(@Param('id') id: string, @CurrentUser() user: AppUser) {
    return this.platformDataService.getOrderById(id, user);
  }

  @Post()
  @Roles(UserRole.Client)
  @ApiOperation({ summary: 'Создать заказ от имени клиента' })
  async createOrder(
    @CurrentUser() user: AppUser,
    @Body() body: CreateOrderDto,
  ) {
    return this.platformDataService.createOrder(user.id, body);
  }

  @Patch(':id/participants/:clientUserId/approve-table')
  @Roles(UserRole.Admin, UserRole.HookahMaster)
  @ApiOperation({
    summary:
      'Подтвердить, что клиент действительно находится за выбранным столом',
  })
  async approveParticipantTable(
    @Param('id') id: string,
    @Param('clientUserId') clientUserId: string,
    @CurrentUser() user: AppUser,
  ) {
    return this.platformDataService.approveParticipantTable(
      id,
      clientUserId,
      user.id,
    );
  }

  @Patch(':id/start')
  @Roles(UserRole.Admin, UserRole.HookahMaster)
  @ApiOperation({ summary: 'Взять заказ в работу' })
  async startOrder(@Param('id') id: string, @CurrentUser() user: AppUser) {
    return this.platformDataService.startOrder(id, user.id);
  }

  @Patch(':id/fulfill')
  @Roles(UserRole.Admin, UserRole.HookahMaster)
  @ApiOperation({
    summary: 'Заполнить фактическую забивку и отдать заказ клиенту',
  })
  async fulfillOrder(
    @Param('id') id: string,
    @CurrentUser() user: AppUser,
    @Body() body: FulfillOrderDto,
  ) {
    return this.platformDataService.fulfillOrder(id, user.id, {
      actualTobaccoIds: body.actualTobaccoIds,
      packingComment: body.packingComment ?? '',
    });
  }

  @Patch(':id/feedback')
  @Roles(UserRole.Client)
  @ApiOperation({
    summary: 'Оценить кальян и оставить отзыв после выдачи заказа',
  })
  async submitFeedback(
    @Param('id') id: string,
    @CurrentUser() user: AppUser,
    @Body() body: SubmitOrderFeedbackDto,
  ) {
    return this.platformDataService.submitOrderFeedback(id, user, body);
  }
}
