import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async check() {
    const timestamp = new Date().toISOString();
    let databaseStatus = 'ok';

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      databaseStatus = 'error';
    }

    const status = databaseStatus === 'ok' ? 'ok' : 'error';

    return {
      status,
      timestamp,
      database: databaseStatus,
    };
  }
}
