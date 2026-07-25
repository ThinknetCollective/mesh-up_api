import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeshNode } from './entities/mesh-node.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { ReputationService, ReputationAction } from '../users/reputation.service';

@Injectable()
export class MeshNodesService {
  constructor(
    @InjectRepository(MeshNode)
    private readonly meshNodeRepository: Repository<MeshNode>,
    private readonly embeddingsService: EmbeddingsService,
    private readonly reputationService: ReputationService,
  ) {}

  async create(createDto: { title: string; description: string; authorId?: string }) {
    const textToEmbed = `${createDto.title} ${createDto.description}`;
    
    // Check for similarity first
    const similar = await this.findSimilar(textToEmbed);
    const topSimilarity = similar.length > 0 ? similar[0].similarity : 0;

    if (topSimilarity > 0.8) {
      // We could return a warning or throw an error. 
      // The AC says "show warning", but in API terms, maybe we just return the similarity info.
      // For now, I'll proceed with creation but include the similarity info in the response if needed,
      // or just follow the AC "If similarity > 80%, show warning".
      // I'll throw a BadRequestException to "show warning" as a simple way to block duplicate.
      throw new BadRequestException({
        message: 'Similar problem exists',
        similarEntries: similar.filter(s => s.similarity > 0.8),
      });
    }

    const embedding = await this.embeddingsService.generateEmbedding(textToEmbed);

    const meshNode = this.meshNodeRepository.create({
      ...createDto,
      embedding,
      embeddingVersion: this.embeddingsService.modelVersion,
    });

    const savedNode = await this.meshNodeRepository.save(meshNode);
    if (createDto.authorId) {
      await this.reputationService.addPoints(createDto.authorId, ReputationAction.SUBMIT_PROBLEM);
    }
    return savedNode;
  }

  async findSimilar(text: string, limit = 5) {
    const embedding = await this.embeddingsService.generateEmbedding(text);
    const vectorString = `[${embedding.join(',')}]`;

    // Use cosine similarity (<=> is cosine distance, so 1 - distance is similarity)
    const similarNodes = await this.meshNodeRepository
      .createQueryBuilder('node')
      .select('node.id', 'id')
      .addSelect('node.title', 'title')
      .addSelect(`1 - (node.embedding <=> :embedding)`, 'similarity')
      .setParameter('embedding', vectorString)
      .orderBy('node.embedding <=> :embedding', 'ASC')
      .limit(limit)
      .getRawMany();

    return similarNodes.map(node => ({
      ...node,
      similarity: parseFloat(node.similarity),
    }));
  }

  async findAll() {
    return this.meshNodeRepository.find();
  }

  async findOne(id: number) {
    return this.meshNodeRepository.findOneBy({ id });
  }
}
