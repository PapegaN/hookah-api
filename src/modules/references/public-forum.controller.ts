import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ForumService,
  type PublicForumCatalogSnapshot,
  type PublicForumItemDetail,
  type PublicForumSectionKey,
} from './forum.service';

@ApiTags('Public Forum')
@Controller({
  path: 'public/forum',
  version: '1',
})
export class PublicForumController {
  constructor(private readonly forumService: ForumService) {}

  @Get()
  @ApiOperation({
    summary:
      'Получить публичный каталог форума по табакам, кальянам и аксессуарам',
  })
  async getCatalog(): Promise<PublicForumCatalogSnapshot> {
    return this.forumService.getCatalog();
  }

  @Get(':section/:itemId')
  @ApiOperation({
    summary:
      'Получить публичную карточку изделия с обсуждением и опытом эксплуатации',
  })
  async getCatalogItem(
    @Param('section') section: PublicForumSectionKey,
    @Param('itemId') itemId: string,
  ): Promise<PublicForumItemDetail> {
    return this.forumService.getCatalogItem(section, itemId);
  }
}
