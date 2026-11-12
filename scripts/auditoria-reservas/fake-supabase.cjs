'use strict';
// Audit harness: a tiny PostgREST-shaped client over a disposable Postgres.
// It implements only the chains the audited handlers use, and returns rows in
// supabase-js shapes (dates and times as strings). Every write is a real SQL
// statement, so durable effects are inspected in Postgres, not in this shim.
const { Pool, types } = require('pg');

types.setTypeParser(1082, v => v);                 // date -> 'YYYY-MM-DD'
types.setTypeParser(1083, v => v);                 // time -> 'HH:MM:SS'
types.setTypeParser(1184, v => new Date(v).toISOString());
types.setTypeParser(1700, v => (v === null ? null : Number(v)));

const ident = name => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`unsafe identifier ${name}`);
  return `"${name}"`;
};

class Query {
  constructor(pool, schema, table, log) {
    Object.assign(this, { pool, schema, table, log, op: 'select', cols: '*', filters: [], orders: [], lim: null,
      payload: null, returning: false, mode: 'many' });
  }
  select(cols = '*') { if (this.op === 'select') this.cols = cols; else this.returning = cols || '*'; return this; }
  update(obj) { this.op = 'update'; this.payload = obj; return this; }
  insert(obj) { this.op = 'insert'; this.payload = obj; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filters.push([c, '=', v]); return this; }
  neq(c, v) { this.filters.push([c, '<>', v]); return this; }
  gte(c, v) { this.filters.push([c, '>=', v]); return this; }
  lte(c, v) { this.filters.push([c, '<=', v]); return this; }
  gt(c, v) { this.filters.push([c, '>', v]); return this; }
  lt(c, v) { this.filters.push([c, '<', v]); return this; }
  ilike(c, v) { this.filters.push([c, 'ILIKE', v]); return this; }
  in(c, v) { this.filters.push([c, 'IN', v]); return this; }
  is(c, v) { this.filters.push([c, 'IS', v]); return this; }
  order(c, opts = {}) { this.orders.push(`${ident(c)} ${opts.ascending === false ? 'DESC' : 'ASC'}`); return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  cols_sql(cols) {
    if (!cols || cols === '*') return '*';
    return cols.split(',').map(c => c.trim()).filter(Boolean).map(c => ident(c.split(':').pop().split('(')[0])).join(', ');
  }
  build() {
    const params = [];
    const where = this.filters.map(([c, op, v]) => {
      if (op === 'IN') { params.push(v); return `${ident(c)}::text = ANY($${params.length}::text[])`; }
      if (op === 'IS') return `${ident(c)} IS ${v === null ? 'NULL' : v ? 'TRUE' : 'FALSE'}`;
      params.push(v); return `${ident(c)} ${op} $${params.length}`;
    });
    const rel = `${ident(this.schema)}.${ident(this.table)}`;
    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    if (this.op === 'select') {
      return { sql: `SELECT ${this.cols_sql(this.cols)} FROM ${rel}${w}${this.orders.length ? ` ORDER BY ${this.orders.join(', ')}` : ''}${this.lim ? ` LIMIT ${Number(this.lim)}` : ''}`, params };
    }
    const ret = this.returning ? ` RETURNING ${this.cols_sql(this.returning)}` : '';
    if (this.op === 'update') {
      const sets = Object.entries(this.payload).map(([k, v]) => { params.push(v); return `${ident(k)} = $${params.length}`; });
      return { sql: `UPDATE ${rel} SET ${sets.join(', ')}${w}${ret}`, params };
    }
    if (this.op === 'insert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const keys = Object.keys(rows[0]);
      const values = rows.map(r => `(${keys.map(k => { params.push(r[k]); return `$${params.length}`; }).join(', ')})`);
      return { sql: `INSERT INTO ${rel} (${keys.map(ident).join(', ')}) VALUES ${values.join(', ')}${ret}`, params };
    }
    return { sql: `DELETE FROM ${rel}${w}${ret}`, params };
  }
  async run() {
    const { sql, params } = this.build();
    this.log.push(sql);
    try {
      const { rows } = await this.pool.query(sql, params);
      if (this.mode === 'single') {
        if (rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: `expected 1 row, got ${rows.length}` } };
        return { data: rows[0], error: null };
      }
      if (this.mode === 'maybe') {
        if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
        return { data: rows[0] || null, error: null };
      }
      return { data: (this.op === 'select' || this.returning) ? rows : null, error: null };
    } catch (e) {
      return { data: null, error: { code: e.code, message: e.message } };
    }
  }
  then(resolve, reject) { return this.run().then(resolve, reject); }
}

function createFakeClient(pool, log = []) {
  const at = schema => ({ from: table => new Query(pool, schema, table, log) });
  return {
    log,
    from: table => new Query(pool, 'public', table, log),
    schema: s => at(s),
    async rpc(fn, args = {}) {
      const keys = Object.keys(args);
      const sql = `SELECT ${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')}) AS result`;
      log.push(sql);
      try {
        const { rows } = await pool.query(sql, keys.map(k => (Array.isArray(args[k]) || args[k] === null || typeof args[k] !== 'object' ? args[k] : JSON.stringify(args[k]))));
        return { data: rows[0].result, error: null };
      } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
    },
  };
}

module.exports = { createFakeClient };
