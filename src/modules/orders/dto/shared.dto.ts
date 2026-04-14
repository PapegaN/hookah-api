import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min, Max } from 'class-validator';

/**
 * Валидатор проверяет, что сумма процентов всех компонентов бленда равна 100.
 * Применяется к массиву объектов с полем `percentage`.
 */
@ValidatorConstraint({ async: false })
export class BlendPercentageSumConstraint implements ValidatorConstraintInterface {
  validate(components: Array<{ percentage: number }>): boolean {
    if (!components || components.length === 0) {
      return false;
    }

    const total = components.reduce(
      (sum, component) => sum + component.percentage,
      0,
    );

    // Разрешаем небольшую погрешность из-за floating point
    return Math.abs(total - 100) < 0.01;
  }

  defaultMessage(): string {
    return 'Сумма процентов всех компонентов бленда должна равняться 100';
  }
}

/**
 * Декоратор для валидации суммы процентов бленда.
 */
export function IsBlendPercentageSumValid(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions ?? {},
      constraints: [],
      validator: BlendPercentageSumConstraint,
    });
  };
}

/**
 * Общий DTO для компонента бленда (табак + процент).
 * Используется в create-order и fulfill-order DTO.
 */
export class BlendComponentDto {
  @ApiProperty({
    example: 'uuid-tobacco-1',
    description: 'ID табака из каталога',
  })
  @IsString()
  tobaccoId!: string;

  @ApiProperty({ example: 60, description: 'Процент табака в бленде (1-100)' })
  @IsNumber()
  @Min(1)
  @Max(100)
  percentage!: number;
}
