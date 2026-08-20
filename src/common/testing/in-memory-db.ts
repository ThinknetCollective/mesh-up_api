import { randomUUID } from 'crypto';
import { DataSource, EntitySchema, MixedList } from 'typeorm';
import { DataType, IMemoryDb, newDb } from 'pg-mem';

/**
 * Boots a real Postgres SQL engine in memory (pg-mem) behind a TypeORM
 * DataSource, for tests that need queries to actually execute rather than be
 * asserted against a mock.
 *
 * Pagination correctness is a claim about how SQL *behaves* — whether a keyset
 * predicate paired with an ORDER BY can duplicate or drop rows. A mocked query
 * builder can only confirm which SQL string was produced, so it cannot test
 * that claim at all. Hence a genuine engine here.
 *
 * pg-mem ships very few native functions, so the Postgres catalog helpers
 * TypeORM's schema introspection depends on are registered by hand below.
 */
export interface InMemoryDbOptions {
  entities: MixedList<string | Function | EntitySchema<any>>;
  /** Register stand-ins for Postgres full-text search. See {@link registerFullTextStubs}. */
  fullText?: boolean;
}

export async function createInMemoryDataSource(
  options: InMemoryDbOptions,
): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  registerCatalogStubs(db);
  registerPgVectorStub(db);
  if (options.fullText) registerFullTextStubs(db);

  return db.adapters
    .createTypeormDataSource({
      type: 'postgres',
      entities: options.entities,
      synchronize: true,
    })
    .initialize();
}

/** The handful of catalog functions TypeORM touches while synchronising. */
function registerCatalogStubs(db: IMemoryDb): void {
  db.public.registerFunction({
    name: 'version',
    returns: 'text' as never,
    implementation: () => 'PostgreSQL 16.0 (pg-mem)',
  });
  db.public.registerFunction({
    name: 'current_database',
    returns: 'text' as never,
    implementation: () => 'test',
  });
  db.public.registerFunction({
    name: 'quote_ident',
    args: ['text' as never],
    returns: 'text' as never,
    implementation: (value: string) => `"${value}"`,
  });
  db.public.registerFunction({
    name: 'obj_description',
    args: ['text' as never, 'text' as never],
    returns: 'text' as never,
    implementation: () => null,
  });
  // Backs the `DEFAULT uuid_generate_v4()` TypeORM emits for uuid primary keys.
  db.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: 'uuid' as never,
    impure: true,
    implementation: () => randomUUID(),
  });
}

/**
 * Stands in for the pgvector extension, which MeshNode.embedding depends on.
 *
 * pg-mem accepts a custom `vector` type but not the parameterised
 * `vector(1536)` form TypeORM emits, so the DDL is rewritten on the way
 * through. The column is never read by pagination — it just has to exist so
 * `synchronize` can create the table.
 */
function registerPgVectorStub(db: IMemoryDb): void {
  db.public.registerEquivalentType({
    name: 'vector',
    equivalentTo: DataType.text,
    isValid: (value: unknown) => typeof value === 'string',
  } as never);

  let rewriting = false;
  db.public.interceptQueries((sql) => {
    if (rewriting || !/vector\(\d+\)/i.test(sql)) return null;

    rewriting = true;
    try {
      db.public.none(sql.replace(/vector\(\d+\)/gi, 'vector'));
      return [];
    } finally {
      rewriting = false;
    }
  });
}

/**
 * Deterministic stand-ins for `to_tsvector`, `plainto_tsquery`, `ts_rank` and
 * the `@@` match operator.
 *
 * IMPORTANT: these are not Postgres' real ranking algorithm, and tests using
 * them prove nothing about `ts_rank`'s scoring quality. What they do let us
 * test is the property that is actually ours to get right: that keyset
 * pagination stays stable when the sort key is an expression recomputed per
 * row, rather than a stored column. The rank deliberately produces ties so the
 * createdAt/id tiebreakers get exercised.
 */
function registerFullTextStubs(db: IMemoryDb): void {
  const terms = (value: string) =>
    String(value ?? '')
      .toLowerCase()
      .split(/\W+/)
      .filter(Boolean);

  db.public.registerFunction({
    name: 'to_tsvector',
    args: ['text' as never, 'text' as never],
    returns: 'text' as never,
    implementation: (_config: string, doc: string) => terms(doc).join(' '),
  });
  db.public.registerFunction({
    name: 'plainto_tsquery',
    args: ['text' as never, 'text' as never],
    returns: 'text' as never,
    implementation: (_config: string, query: string) => terms(query).join(' '),
  });
  // Occurrence count, scaled — coarse enough that ties are common.
  db.public.registerFunction({
    name: 'ts_rank',
    args: ['text' as never, 'text' as never],
    // pg-mem does not recognise the `float8` alias here, only the full name.
    returns: 'double precision' as never,
    implementation: (vector: string, query: string) => {
      const words = terms(vector);
      const wanted = terms(query);
      if (wanted.length === 0) return 0;
      const hits = words.filter((w) => wanted.includes(w)).length;
      return hits / 10;
    },
  });
  db.public.registerOperator({
    operator: '@@',
    left: 'text' as never,
    right: 'text' as never,
    returns: 'bool' as never,
    implementation: (vector: string, query: string) => {
      const words = new Set(terms(vector));
      const wanted = terms(query);
      return wanted.length > 0 && wanted.some((w) => words.has(w));
    },
  });
}
