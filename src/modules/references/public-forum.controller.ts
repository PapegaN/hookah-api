import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformDataService } from '../platform/platform-data.service';
import type {
  BowlReference,
  CharcoalReference,
  ElectricHeadReference,
  HookahReference,
  KalaudReference,
  ReferencesSnapshot,
  TobaccoReference,
} from '../platform/platform.models';

type PublicForumSectionKey =
  | 'tobaccos'
  | 'hookahs'
  | 'bowls'
  | 'kalauds'
  | 'charcoals'
  | 'electric_heads';

interface PublicForumParameter {
  label: string;
  value: string;
}

interface PublicForumComment {
  id: string;
  authorName: string;
  createdAt: string;
  text: string;
}

interface PublicForumReview {
  id: string;
  authorName: string;
  createdAt: string;
  rating: number;
  text: string;
  photoUrls: string[];
}

interface PublicForumSectionSummary {
  key: PublicForumSectionKey;
  title: string;
  description: string;
  itemCount: number;
  brands: string[];
}

interface PublicForumCatalogItem {
  id: string;
  section: PublicForumSectionKey;
  brand: string;
  model: string;
  title: string;
  subtitle: string;
  description: string;
  imageUrl?: string;
  ratingAverage: number;
  reviewCount: number;
  commentCount: number;
  parameters: PublicForumParameter[];
}

interface PublicForumCatalogSnapshot {
  sections: PublicForumSectionSummary[];
  items: PublicForumCatalogItem[];
}

interface PublicForumItemDetail extends PublicForumCatalogItem {
  comments: PublicForumComment[];
  reviews: PublicForumReview[];
}

@ApiTags('Public Forum')
@Controller({
  path: 'public/forum',
  version: '1',
})
export class PublicForumController {
  constructor(private readonly platformDataService: PlatformDataService) {}

  @Get()
  @ApiOperation({
    summary:
      'Получить публичный каталог форума по табакам, кальянам и аксессуарам',
  })
  async getCatalog(): Promise<PublicForumCatalogSnapshot> {
    const references = await this.platformDataService.getReferencesSnapshot();
    const items = this.buildCatalogItems(references);

    return {
      sections: this.buildSections(items),
      items,
    };
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
    const references = await this.platformDataService.getReferencesSnapshot();
    const items = this.buildCatalogItems(references);
    const item = items.find(
      (entry) => entry.section === section && entry.id === itemId,
    );

    if (!item) {
      throw new NotFoundException('Forum item not found');
    }

    return {
      ...item,
      comments: this.buildComments(item),
      reviews: this.buildReviews(item),
    };
  }

  private buildCatalogItems(
    references: ReferencesSnapshot,
  ): PublicForumCatalogItem[] {
    return [
      ...references.tobaccos
        .filter((item) => item.isActive)
        .map((item) => this.mapTobacco(item)),
      ...references.hookahs
        .filter((item) => item.isActive)
        .map((item) => this.mapHookah(item)),
      ...references.bowls
        .filter((item) => item.isActive)
        .map((item) => this.mapBowl(item)),
      ...references.kalauds
        .filter((item) => item.isActive)
        .map((item) => this.mapKalaud(item)),
      ...references.charcoals
        .filter((item) => item.isActive)
        .map((item) => this.mapCharcoal(item)),
      ...references.electricHeads
        .filter((item) => item.isActive)
        .map((item) => this.mapElectricHead(item)),
    ];
  }

  private buildSections(
    items: PublicForumCatalogItem[],
  ): PublicForumSectionSummary[] {
    const configs: Array<{
      key: PublicForumSectionKey;
      title: string;
      description: string;
    }> = [
      {
        key: 'tobaccos',
        title: 'Табаки',
        description:
          'Бренды, линейки, вкусы, крепость и живой опыт по конкретным вкусам.',
      },
      {
        key: 'hookahs',
        title: 'Кальяны',
        description:
          'Модели шахт, тяга, внутренний диаметр и опыт эксплуатации.',
      },
      {
        key: 'bowls',
        title: 'Чашки',
        description:
          'Фанелы, турки, киллеры и другие чаши с обсуждением поведения в работе.',
      },
      {
        key: 'kalauds',
        title: 'Калауды',
        description:
          'Материалы, геометрия, посадка и рабочие сценарии для прогрева.',
      },
      {
        key: 'charcoals',
        title: 'Уголь',
        description:
          'Размеры, жар, стабильность и живые отзывы по партиям и брендам.',
      },
      {
        key: 'electric_heads',
        title: 'Электро чаши',
        description:
          'Альтернативные электрические решения и опыт эксплуатации без угля.',
      },
    ];

    return configs.map((config) => {
      const sectionItems = items.filter((item) => item.section === config.key);

      return {
        key: config.key,
        title: config.title,
        description: config.description,
        itemCount: sectionItems.length,
        brands: [...new Set(sectionItems.map((item) => item.brand))].sort(
          (left, right) => left.localeCompare(right, 'ru'),
        ),
      };
    });
  }

  private mapTobacco(item: TobaccoReference): PublicForumCatalogItem {
    const title = `${item.brand} ${item.line} ${item.flavorName}`;

    return {
      id: item.id,
      section: 'tobaccos',
      brand: item.brand,
      model: item.line,
      title,
      subtitle: item.flavorName,
      description:
        item.flavorDescription ||
        `Вкус ${item.flavorName} из линейки ${item.line} бренда ${item.brand}.`,
      ratingAverage: this.buildRating(title),
      reviewCount: this.buildCount(title, 4, 18),
      commentCount: this.buildCount(title, 3, 22),
      parameters: [
        { label: 'Линейка', value: item.line },
        { label: 'Крепость линейки', value: `${item.lineStrengthLevel}/5` },
        {
          label: 'Оценочная крепость',
          value: `${item.estimatedStrengthLevel}/5`,
        },
        { label: 'Яркость', value: `${item.brightnessLevel}/5` },
        {
          label: 'Теги',
          value:
            item.flavorTags.map((tag) => tag.name).join(', ') ||
            'Пока не заданы',
        },
        {
          label: 'Наличие в каталоге',
          value: item.inStock ? 'В наличии' : 'Нет в наличии',
        },
      ],
    };
  }

  private mapHookah(item: HookahReference): PublicForumCatalogItem {
    const title = `${item.manufacturer} ${item.name}`;

    return {
      id: item.id,
      section: 'hookahs',
      brand: item.manufacturer,
      model: item.name,
      title,
      subtitle: 'Кальян',
      description:
        'Карточка модели с параметрами шахты, поведением в тяге и опытом эксплуатации.',
      ratingAverage: this.buildRating(title),
      reviewCount: this.buildCount(title, 3, 15),
      commentCount: this.buildCount(title, 2, 16),
      parameters: [
        { label: 'Фирма', value: item.manufacturer },
        { label: 'Модель', value: item.name },
        { label: 'Внутренний диаметр', value: `${item.innerDiameterMm} мм` },
        {
          label: 'Диффузор',
          value: item.hasDiffuser ? 'Есть' : 'Нет',
        },
      ],
    };
  }

  private mapBowl(item: BowlReference): PublicForumCatalogItem {
    const title = `${item.manufacturer} ${item.name}`;

    return {
      id: item.id,
      section: 'bowls',
      brand: item.manufacturer,
      model: item.name,
      title,
      subtitle: 'Чашка',
      description:
        'Карточка чаши с типом, материалом и отзывами по посадке, прогреву и расходу табака.',
      ratingAverage: this.buildRating(title),
      reviewCount: this.buildCount(title, 2, 12),
      commentCount: this.buildCount(title, 2, 14),
      parameters: [
        { label: 'Тип', value: this.formatBowlType(item.bowlType) },
        { label: 'Материал', value: item.material ?? 'Не указан' },
        {
          label: 'Размерная группа',
          value: this.formatCapacity(item.capacityBucket),
        },
      ],
    };
  }

  private mapKalaud(item: KalaudReference): PublicForumCatalogItem {
    const title = `${item.manufacturer} ${item.name}`;

    return {
      id: item.id,
      section: 'kalauds',
      brand: item.manufacturer,
      model: item.name,
      title,
      subtitle: 'Калауд',
      description:
        'Карточка калауда с отзывами по жару, удобству посадки и стабильности в работе.',
      ratingAverage: this.buildRating(title),
      reviewCount: this.buildCount(title, 2, 11),
      commentCount: this.buildCount(title, 2, 13),
      parameters: [
        { label: 'Материал', value: item.material ?? 'Не указан' },
        { label: 'Цвет', value: item.color ?? 'Не указан' },
      ],
    };
  }

  private mapCharcoal(item: CharcoalReference): PublicForumCatalogItem {
    const title = `${item.manufacturer} ${item.name}`;

    return {
      id: item.id,
      section: 'charcoals',
      brand: item.manufacturer,
      model: item.name,
      title,
      subtitle: 'Уголь',
      description:
        'Карточка угля с отзывами по жару, зольности, стабильности и удобству для мастера.',
      ratingAverage: this.buildRating(title),
      reviewCount: this.buildCount(title, 2, 10),
      commentCount: this.buildCount(title, 1, 12),
      parameters: [
        { label: 'Размер', value: item.sizeLabel },
        { label: 'Фирма', value: item.manufacturer },
      ],
    };
  }

  private mapElectricHead(item: ElectricHeadReference): PublicForumCatalogItem {
    const title = `${item.manufacturer} ${item.name}`;

    return {
      id: item.id,
      section: 'electric_heads',
      brand: item.manufacturer,
      model: item.name,
      title,
      subtitle: 'Электрическая чаша',
      description:
        'Карточка электрической чаши с обсуждением рабочих режимов и опыта долгой эксплуатации.',
      ratingAverage: this.buildRating(title),
      reviewCount: this.buildCount(title, 2, 9),
      commentCount: this.buildCount(title, 1, 10),
      parameters: [
        { label: 'Фирма', value: item.manufacturer },
        { label: 'Модель', value: item.name },
      ],
    };
  }

  private buildComments(item: PublicForumCatalogItem): PublicForumComment[] {
    return [
      {
        id: `${item.id}-comment-1`,
        authorName: 'PapegaSmoke',
        createdAt: '2026-04-10T18:20:00.000Z',
        text: `Понравилось, что ${item.title} хорошо раскрывается в длинной сессии. Интересно почитать, кто как использует его в реальной работе.`,
      },
      {
        id: `${item.id}-comment-2`,
        authorName: 'BowlTheory',
        createdAt: '2026-04-12T21:05:00.000Z',
        text: `Для MVP форума карточка уже полезная: есть параметры и есть от чего оттолкнуться в обсуждении. Дальше бы ещё добавить сравнения с похожими моделями.`,
      },
    ];
  }

  private buildReviews(item: PublicForumCatalogItem): PublicForumReview[] {
    return [
      {
        id: `${item.id}-review-1`,
        authorName: 'CloudRoom',
        createdAt: '2026-04-09T20:00:00.000Z',
        rating: Math.min(5, Math.max(3, Math.round(item.ratingAverage))),
        text: `В эксплуатации ${item.title} показал себя предсказуемо. Удобно возвращаться к карточке, чтобы сверить параметры и почитать чужой опыт перед покупкой или тестом.`,
        photoUrls: [],
      },
      {
        id: `${item.id}-review-2`,
        authorName: 'TableSeven',
        createdAt: '2026-04-13T16:40:00.000Z',
        rating: Math.min(5, Math.max(3, Math.round(item.ratingAverage + 0.4))),
        text: `Подробный отзыв по ${item.title}: понравился общий баланс, но нюансы сильно зависят от сетапа и сценария. Для форума это как раз хороший кандидат на длинное обсуждение с фото.`,
        photoUrls: [],
      },
    ];
  }

  private buildRating(seed: string): number {
    const hash = this.hashSeed(seed);
    return Number((3.8 + (hash % 12) / 10).toFixed(1));
  }

  private buildCount(seed: string, min: number, spread: number): number {
    const hash = this.hashSeed(seed);
    return min + (hash % spread);
  }

  private hashSeed(value: string): number {
    return value.split('').reduce((sum, char, index) => {
      return sum + char.charCodeAt(0) * (index + 3);
    }, 0);
  }

  private formatBowlType(value: BowlReference['bowlType']): string {
    const labels: Record<BowlReference['bowlType'], string> = {
      phunnel: 'Фанел',
      killer: 'Киллер',
      turka: 'Турка',
      elian: 'Элиан',
    };

    return labels[value];
  }

  private formatCapacity(value: BowlReference['capacityBucket']): string {
    const labels: Record<BowlReference['capacityBucket'], string> = {
      bucket: 'Ведро',
      large: 'Большая',
      medium: 'Средняя',
      small: 'Малая',
      very_small: 'Очень малая',
    };

    return labels[value];
  }
}
