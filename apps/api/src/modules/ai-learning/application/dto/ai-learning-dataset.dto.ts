import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateAiLearningTrainingDto } from './ai-learning-training.dto';

class TrainingRecordDto extends CreateAiLearningTrainingDto {}

export class CreateAiLearningDatasetDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainingRecordDto)
  trainingDataset!: TrainingRecordDto[];
}
