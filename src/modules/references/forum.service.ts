import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
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

export type PublicForumSectionKey =
  | 'tobaccos'
  | 'hookahs'
  | 'bowls'
  | 'kalauds'
  | 'charcoals'
  | 'electric_heads';

export interface PublicForumParameter {
  label: string;
  value: string;
}

export interface PublicForumComment {
  id: string;
  authorName: string;
  createdAt: string;
  text: string;
  photoUrls: string[];
}

export interface PublicForumReview {
  id: string;
  authorName: string;
  createdAt: string;
  rating: number;
  text: string;
  photoUrls: string[];
}

export interface PublicForumSectionSummary {
  key: PublicForumSectionKey;
  title: string;
  description: string;
  itemCount: number;
  brands: string[];
}

export interface PublicForumCatalogItem {
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

export interface PublicForumCatalogSnapshot {
  sections: PublicForumSectionSummary[];
  items: PublicForumCatalogItem[];
}

export interface PublicForumItemDetail extends PublicForumCatalogItem {
  comments: PublicForumComment[];
  reviews: PublicForumReview[];
}

interface TopicSummary {
  topicId: string;
  section: PublicForumSectionKey;
  referenceItemId: string;
  descriptionOverride: string | undefined;
  imageUrl: string | undefined;
  ratingAverage: number;
  reviewCount: number;
  commentCount: number;
}

@Injectable()
export class ForumService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly platformDataService: PlatformDataService,
  ) {}

  async getCatalog(): Promise<PublicForumCatalogSnapshot> {
    const references = await this.platformDataService.getReferencesSnapshot();

    if (!this.databaseService.isEnabled()) {
      const items = this.buildGeneratedCatalogItems(references);
      return {
        sections: this.buildSections(items),
        items,
      };
    }

    const topicSummaries = await this.loadTopicSummaries();
    const items = this.buildRealCatalogItems(references, topicSummaries);

    return {
      sections: this.buildSections(items),
      items,
    };
  }

  async getCatalogItem(
    section: PublicForumSectionKey,
    itemId: string,
  ): Promise<PublicForumItemDetail> {
    const references = await this.platformDataService.getReferencesSnapshot();

    if (!this.databaseService.isEnabled()) {
      const items = this.buildGeneratedCatalogItems(references);
      const item = items.find(
        (entry) => entry.section === section && entry.id === itemId,
      );

      if (!item) {
        throw new NotFoundException('Forum item not found');
      }

      return {
        ...item,
        comments: this.buildGeneratedComments(item),
        reviews: this.buildGeneratedReviews(item),
      };
    }

    const topicSummaries = await this.loadTopicSummaries();
    const items = this.buildRealCatalogItems(references, topicSummaries);
    const item = items.find(
      (entry) => entry.section === section && entry.id === itemId,
    );

    if (!item) {
      throw new NotFoundException('Forum item not found');
    }

    const topic = topicSummaries.get(this.toTopicKey(section, itemId));

    return {
      ...item,
      comments: topic ? await this.loadComments(topic.topicId) : [],
      reviews: topic ? await this.loadReviews(topic.topicId) : [],
    };
  }

  private async loadTopicSummaries(): Promise<Map<string, TopicSummary>> {
    const result = await this.databaseService.query(
      `
        select
          topic.id::text as topic_id,
          topic.section_key,
          topic.reference_item_id::text as reference_item_id,
          topic.description_override,
          cover_asset.public_url as image_url,
          coalesce(comment_stats.comment_count, 0) as comment_count,
          coalesce(review_stats.review_count, 0) as review_count,
          coalesce(review_stats.rating_average, 0) as rating_average
        from forum.item_topics topic
        left join media.assets cover_asset
          on cover_asset.id = topic.cover_asset_id
         and cover_asset.status = 'uploaded'
        left join lateral (
          select count(*)::int as comment_count
          from forum.comments comment_entry
          where comment_entry.topic_id = topic.id
            and comment_entry.is_published = true
        ) comment_stats on true
        left join lateral (
          select
            count(*)::int as review_count,
            round(avg(review_entry.rating_score)::numeric, 1) as rating_average
          from forum.reviews review_entry
          where review_entry.topic_id = topic.id
            and review_entry.is_published = true
        ) review_stats on true
        where topic.is_published = true
      `,
    );

    return new Map(
      result.rows.map((row) => {
        const summary: TopicSummary = {
          topicId: row.topic_id as string,
          section: row.section_key as PublicForumSectionKey,
          referenceItemId: row.reference_item_id as string,
          descriptionOverride:
            (row.description_override as string | null) ?? undefined,
          imageUrl: (row.image_url as string | null) ?? undefined,
          ratingAverage: Number(row.rating_average ?? 0),
          reviewCount: Number(row.review_count ?? 0),
          commentCount: Number(row.comment_count ?? 0),
        };

        return [
          this.toTopicKey(summary.section, summary.referenceItemId),
          summary,
        ];
      }),
    );
  }

  private async loadComments(topicId: string): Promise<PublicForumComment[]> {
    const result = await this.databaseService.query(
      `
        select
          comment_entry.id::text as id,
          coalesce(author_user.login, 'Удалённый пользователь') as author_name,
          comment_entry.created_at,
          comment_entry.body,
          coalesce(
            json_agg(comment_asset.public_url order by comment_link.sort_order)
              filter (
                where comment_asset.public_url is not null
                  and comment_asset.status = 'uploaded'
              ),
            '[]'::json
          ) as photo_urls
        from forum.comments comment_entry
        left join auth.users author_user
          on author_user.id = comment_entry.author_user_id
        left join forum.comment_assets comment_link
          on comment_link.comment_id = comment_entry.id
        left join media.assets comment_asset
          on comment_asset.id = comment_link.asset_id
        where comment_entry.topic_id = $1
          and comment_entry.is_published = true
        group by comment_entry.id, author_user.login, comment_entry.created_at, comment_entry.body
        order by comment_entry.created_at asc
      `,
      [topicId],
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      authorName: row.author_name as string,
      createdAt: new Date(row.created_at as string).toISOString(),
      text: row.body as string,
      photoUrls: this.parsePhotoUrls(row.photo_urls),
    }));
  }

  private async loadReviews(topicId: string): Promise<PublicForumReview[]> {
    const result = await this.databaseService.query(
      `
        select
          review_entry.id::text as id,
          coalesce(author_user.login, 'Удалённый пользователь') as author_name,
          review_entry.created_at,
          review_entry.rating_score,
          review_entry.body,
          coalesce(
            json_agg(review_asset.public_url order by review_link.sort_order)
              filter (
                where review_asset.public_url is not null
                  and review_asset.status = 'uploaded'
              ),
            '[]'::json
          ) as photo_urls
        from forum.reviews review_entry
        left join auth.users author_user
          on author_user.id = review_entry.author_user_id
        left join forum.review_assets review_link
          on review_link.review_id = review_entry.id
        left join media.assets review_asset
          on review_asset.id = review_link.asset_id
        where review_entry.topic_id = $1
          and review_entry.is_published = true
        group by
          review_entry.id,
          author_user.login,
          review_entry.created_at,
          review_entry.rating_score,
          review_entry.body
        order by review_entry.created_at desc
      `,
      [topicId],
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      authorName: row.author_name as string,
      createdAt: new Date(row.created_at as string).toISOString(),
      rating: Number(row.rating_score),
      text: row.body as string,
      photoUrls: this.parsePhotoUrls(row.photo_urls),
    }));
  }

  private buildRealCatalogItems(
    references: ReferencesSnapshot,
    topicSummaries: Map<string, TopicSummary>,
  ): PublicForumCatalogItem[] {
    return [
      ...references.tobaccos
        .filter((item) => item.isActive)
        .map((item) =>
          this.mapTobacco(
            item,
            topicSummaries.get(this.toTopicKey('tobaccos', item.id)) ??
              this.buildMissingTopicSummary('tobaccos', item.id),
          ),
        ),
      ...references.hookahs
        .filter((item) => item.isActive)
        .map((item) =>
          this.mapHookah(
            item,
            topicSummaries.get(this.toTopicKey('hookahs', item.id)) ??
              this.buildMissingTopicSummary('hookahs', item.id),
          ),
        ),
      ...references.bowls
        .filter((item) => item.isActive)
        .map((item) =>
          this.mapBowl(
            item,
            topicSummaries.get(this.toTopicKey('bowls', item.id)) ??
              this.buildMissingTopicSummary('bowls', item.id),
          ),
        ),
      ...references.kalauds
        .filter((item) => item.isActive)
        .map((item) =>
          this.mapKalaud(
            item,
            topicSummaries.get(this.toTopicKey('kalauds', item.id)) ??
              this.buildMissingTopicSummary('kalauds', item.id),
          ),
        ),
      ...references.charcoals
        .filter((item) => item.isActive)
        .map((item) =>
          this.mapCharcoal(
            item,
            topicSummaries.get(this.toTopicKey('charcoals', item.id)) ??
              this.buildMissingTopicSummary('charcoals', item.id),
          ),
        ),
      ...references.electricHeads
        .filter((item) => item.isActive)
        .map((item) =>
          this.mapElectricHead(
            item,
            topicSummaries.get(this.toTopicKey('electric_heads', item.id)) ??
              this.buildMissingTopicSummary('electric_heads', item.id),
          ),
        ),
    ];
  }

  private buildGeneratedCatalogItems(
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
        title: 'Электрочаши',
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

  private mapTobacco(
    item: TobaccoReference,
    topicSummary?: TopicSummary,
  ): PublicForumCatalogItem {
    const title = `${item.brand} ${item.line} ${item.flavorName}`;

    return {
      ...this.withOptionalImage(topicSummary?.imageUrl),
      id: item.id,
      section: 'tobaccos',
      brand: item.brand,
      model: item.line,
      title,
      subtitle: item.flavorName,
      description:
        topicSummary?.descriptionOverride ??
        (item.flavorDescription ||
          `Вкус ${item.flavorName} из линейки ${item.line} бренда ${item.brand}.`),
      ratingAverage: topicSummary?.ratingAverage ?? this.buildRating(title),
      reviewCount: topicSummary?.reviewCount ?? this.buildCount(title, 4, 18),
      commentCount: topicSummary?.commentCount ?? this.buildCount(title, 3, 22),
      parameters: [
        { label: 'Линейка', value: item.line },
        { label: 'Крепость линейки', value: `${item.lineStrengthLevel}/5` },
        {
          label: 'Оценочная крепость',
          value: `${item.estimatedStrengthLevel}/5`,
        },
        { label: 'Яркость', value: `${item.brightnessLevel}/5` },
        {
          label: 'Теги вкуса',
          value:
            item.flavorTags.map((tag) => tag.name).join(', ') ||
            'Пока не заданы',
        },
        {
          label: 'Наличие',
          value: item.inStock ? 'В наличии' : 'Нет в наличии',
        },
      ],
    };
  }

  private mapHookah(
    item: HookahReference,
    topicSummary?: TopicSummary,
  ): PublicForumCatalogItem {
    const title = `${item.manufacturer} ${item.name}`;

    return {
      ...this.withOptionalImage(topicSummary?.imageUrl),
      id: item.id,
      section: 'hookahs',
      brand: item.manufacturer,
      model: item.name,
      title,
      subtitle: 'Кальян',
      description:
        topicSummary?.descriptionOverride ??
        'Карточка модели с параметрами шахты, поведением в тяге и опытом эксплуатации.',
      ratingAverage: topicSummary?.ratingAverage ?? this.buildRating(title),
      reviewCount: topicSummary?.reviewCount ?? this.buildCount(title, 3, 15),
      commentCount: topicSummary?.commentCount ?? this.buildCount(title, 2, 16),
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

  private mapBowl(
    item: BowlReference,
    topicSummary?: TopicSummary,
  ): PublicForumCatalogItem {
    const title = `${item.manufacturer} ${item.name}`;

    return {
      ...this.withOptionalImage(topicSummary?.imageUrl),
      id: item.id,
      section: 'bowls',
      brand: item.manufacturer,
      model: item.name,
      title,
      subtitle: 'Чашка',
      description:
        topicSummary?.descriptionOverride ??
        'Карточка чаши с типом, материалом и отзывами по посадке, прогреву и расходу табака.',
      ratingAverage: topicSummary?.ratingAverage ?? this.buildRating(title),
      reviewCount: topicSummary?.reviewCount ?? this.buildCount(title, 2, 12),
      commentCount: topicSummary?.commentCount ?? this.buildCount(title, 2, 14),
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

  private mapKalaud(
    item: KalaudReference,
    topicSummary?: TopicSummary,
  ): PublicForumCatalogItem {
    const title = `${item.manufacturer} ${item.name}`;

    return {
      ...this.withOptionalImage(topicSummary?.imageUrl),
      id: item.id,
      section: 'kalauds',
      brand: item.manufacturer,
      model: item.name,
      title,
      subtitle: 'Калауд',
      description:
        topicSummary?.descriptionOverride ??
        'Карточка калауда с отзывами по жару, удобству посадки и стабильности в работе.',
      ratingAverage: topicSummary?.ratingAverage ?? this.buildRating(title),
      reviewCount: topicSummary?.reviewCount ?? this.buildCount(title, 2, 11),
      commentCount: topicSummary?.commentCount ?? this.buildCount(title, 2, 13),
      parameters: [
        { label: 'Материал', value: item.material ?? 'Не указан' },
        { label: 'Цвет', value: item.color ?? 'Не указан' },
      ],
    };
  }

  private mapCharcoal(
    item: CharcoalReference,
    topicSummary?: TopicSummary,
  ): PublicForumCatalogItem {
    const title = `${item.manufacturer} ${item.name}`;

    return {
      ...this.withOptionalImage(topicSummary?.imageUrl),
      id: item.id,
      section: 'charcoals',
      brand: item.manufacturer,
      model: item.name,
      title,
      subtitle: 'Уголь',
      description:
        topicSummary?.descriptionOverride ??
        'Карточка угля с отзывами по жару, зольности, стабильности и удобству для мастера.',
      ratingAverage: topicSummary?.ratingAverage ?? this.buildRating(title),
      reviewCount: topicSummary?.reviewCount ?? this.buildCount(title, 2, 10),
      commentCount: topicSummary?.commentCount ?? this.buildCount(title, 1, 12),
      parameters: [
        { label: 'Размер', value: item.sizeLabel },
        { label: 'Фирма', value: item.manufacturer },
      ],
    };
  }

  private mapElectricHead(
    item: ElectricHeadReference,
    topicSummary?: TopicSummary,
  ): PublicForumCatalogItem {
    const title = `${item.manufacturer} ${item.name}`;

    return {
      ...this.withOptionalImage(topicSummary?.imageUrl),
      id: item.id,
      section: 'electric_heads',
      brand: item.manufacturer,
      model: item.name,
      title,
      subtitle: 'Электрическая чаша',
      description:
        topicSummary?.descriptionOverride ??
        'Карточка электрической чаши с обсуждением рабочих режимов и опыта долгой эксплуатации.',
      ratingAverage: topicSummary?.ratingAverage ?? this.buildRating(title),
      reviewCount: topicSummary?.reviewCount ?? this.buildCount(title, 2, 9),
      commentCount: topicSummary?.commentCount ?? this.buildCount(title, 1, 10),
      parameters: [
        { label: 'Фирма', value: item.manufacturer },
        { label: 'Модель', value: item.name },
      ],
    };
  }

  private buildGeneratedComments(
    item: PublicForumCatalogItem,
  ): PublicForumComment[] {
    return [
      {
        id: `${item.id}-comment-1`,
        authorName: 'PapegaSmoke',
        createdAt: '2026-04-10T18:20:00.000Z',
        text: `Понравилось, что ${item.title} хорошо раскрывается в длинной сессии. Интересно почитать, кто как использует его в реальной работе.`,
        photoUrls: [],
      },
      {
        id: `${item.id}-comment-2`,
        authorName: 'BowlTheory',
        createdAt: '2026-04-12T21:05:00.000Z',
        text: `Для текущего этапа форум уже полезен: есть параметры и есть от чего оттолкнуться в обсуждении. Следующим шагом хочется видеть сравнения с похожими моделями.`,
        photoUrls: [],
      },
    ];
  }

  private buildGeneratedReviews(
    item: PublicForumCatalogItem,
  ): PublicForumReview[] {
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
        text: `Подробный отзыв по ${item.title}: понравился общий баланс, но нюансы сильно зависят от сетапа и сценария. Для форума это хороший кандидат на длинное обсуждение с фото и сравнением разных подходов.`,
        photoUrls: [],
      },
    ];
  }

  private parsePhotoUrls(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private toTopicKey(
    section: PublicForumSectionKey,
    referenceItemId: string,
  ): string {
    return `${section}:${referenceItemId}`;
  }

  private buildMissingTopicSummary(
    section: PublicForumSectionKey,
    referenceItemId: string,
  ): TopicSummary {
    return {
      topicId: '',
      section,
      referenceItemId,
      descriptionOverride: undefined,
      imageUrl: undefined,
      ratingAverage: 0,
      reviewCount: 0,
      commentCount: 0,
    };
  }

  private withOptionalImage(imageUrl: string | undefined): {
    imageUrl?: string;
  } {
    return imageUrl ? { imageUrl } : {};
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
