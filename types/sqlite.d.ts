// 项目保留 @types/node 20；声明本项目使用的 Node 24 内置 SQLite API，无需原生扩展依赖。
declare module 'node:sqlite' {
  type SQLValue = null | number | bigint | string | Uint8Array;
  type Row = Record<string, null | number | bigint | string | Uint8Array>;
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): {
      get(...values: SQLValue[]): Row | undefined;
      all(...values: SQLValue[]): Row[];
      run(...values: SQLValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    };
    close(): void;
  }
}
