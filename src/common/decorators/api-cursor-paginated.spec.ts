import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { SolutionsController } from '../../solutions/solutions.controller';
import { SolutionsService } from '../../solutions/solutions.service';
import { SearchController } from '../../search/search.controller';
import { SearchService } from '../../search/search.service';
import { CommentsController } from '../../comments/comments.controller';
import { CommentsService } from '../../comments/comments.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { EXAMPLE_CURSOR } from '../dto/cursor-pagination-query.dto';
import { CursorSpec, cursorScope, decodeCursor } from '../utils/cursor.util';

/**
 * The OpenAPI document is a deliverable in its own right, so it gets asserted
 * rather than assumed: a decorator that silently produces an empty schema
 * still compiles and still passes every other test in the suite.
 */
describe('OpenAPI document — cursor pagination', () => {
  let app: INestApplication;
  let doc: any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SolutionsController, SearchController, CommentsController],
      providers: [
        { provide: SolutionsService, useValue: {} },
        { provide: SearchService, useValue: {} },
        { provide: CommentsService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('t').setVersion('1.0').build(),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  const paginated: Array<[string, string, boolean]> = [
    ['/v1/solutions', 'Solutions', false],
    ['/v1/search', 'Search', true],
    ['/api/v1/solutions/{id}/comments', 'Comments', true],
  ];

  it.each(paginated)('documents %s', (path) => {
    expect(doc.paths[path]?.get).toBeDefined();
  });

  it.each(paginated)('%s returns the { items, nextCursor, hasMore } envelope', (path) => {
    const schema = doc.paths[path].get.responses['200'].content['application/json'].schema;

    expect(schema.properties.items.type).toBe('array');
    expect(schema.properties.items.items.$ref).toMatch(/^#\/components\/schemas\//);
    expect(schema.properties.nextCursor).toMatchObject({ type: 'string', nullable: true });
    expect(schema.properties.hasMore.type).toBe('boolean');
    expect(schema.required.sort()).toEqual(['hasMore', 'items', 'nextCursor']);
  });

  it.each(paginated)('%s accepts cursor and limit query params', (path) => {
    const names = doc.paths[path].get.parameters.map((p: any) => p.name);

    expect(names).toContain('cursor');
    expect(names).toContain('limit');
  });

  it.each(paginated)('%s ships a response example', (path) => {
    const example = doc.paths[path].get.responses['200'].content['application/json'].example;

    expect(Array.isArray(example.items)).toBe(true);
    expect(example.items.length).toBeGreaterThan(0);
    expect(typeof example.hasMore).toBe('boolean');
  });

  it.each(paginated)('%s marks page deprecated only where it is still accepted', (path, _tag, expectsPage) => {
    const page = doc.paths[path].get.parameters.find((p: any) => p.name === 'page');

    if (expectsPage) {
      expect(page).toBeDefined();
      expect(page.deprecated).toBe(true);
      expect(page.description).toMatch(/DEPRECATED/);
    } else {
      // GET /v1/solutions is new and never accepted an offset param.
      expect(page).toBeUndefined();
    }
  });

  it.each(paginated)('%s is tagged and has a summary', (path, tag) => {
    expect(doc.paths[path].get.tags).toContain(tag);
    expect(doc.paths[path].get.summary).toBeTruthy();
  });

  it.each(paginated)('%s documents the 400 for a bad cursor', (path) => {
    expect(doc.paths[path].get.responses['400']).toBeDefined();
  });

  it.each(paginated)('%s example nextCursor is a decodable cursor', (path) => {
    // A hand-written example token that does not round-trip is worse than no
    // example: a reader copies it and gets a 400. Every documented cursor must
    // be a real one, carrying the format version, sort values, id and the
    // query-scope fingerprint.
    const { nextCursor } =
      doc.paths[path].get.responses['200'].content['application/json'].example;

    const payload = JSON.parse(Buffer.from(nextCursor, 'base64url').toString('utf8'));

    expect(payload.p).toBe(1);
    expect(Array.isArray(payload.v)).toBe(true);
    expect(payload.v.length).toBeGreaterThan(0);
    expect(payload.i === null || payload.i === undefined).toBe(false);
    expect(typeof payload.s).toBe('string');
  });

  it('the shared DTO example cursor decodes against a real spec', () => {
    // EXAMPLE_CURSOR documents the comments ordering, so decode it with that
    // spec — including the scope check, which is what caught the original
    // hand-written examples being wrong.
    const spec: CursorSpec = {
      keys: [
        {
          expr: 'comment.createdAt',
          type: 'date',
          direction: 'ASC',
          nulls: 'LAST',
          nonNullable: true,
        },
      ],
      id: { expr: 'comment.id', type: 'string', direction: 'ASC' },
      scope: cursorScope({ solutionId: '3f0c1b8e-9d2a-4c7f-8a11-5e6b0d9c4a21' }),
    };

    const decoded = decodeCursor(spec, EXAMPLE_CURSOR);

    expect(decoded.values[0]).toBeInstanceOf(Date);
    expect(decoded.id).toBe('a15f8d62-3e7c-4b09-8f24-6c1b9a0d3e75');
  });
});
