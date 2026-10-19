'use strict';
/**
 * ที่เก็บข้อมูลจริงของ Db (1 collection ต่อ 1 ชีตเดิม, 1 document ต่อ 1 แถว)
 *   load(name)            → [{ _row: docId, _seq, ...fields }]
 *   getMeta()             → { versions: { [name]: n } }   ใช้ตรวจว่ามีคนอื่นแก้ข้อมูล (ต้องโหลดใหม่)
 *   commit(ops, bumps)    → เขียน ops [{ name, id, data }] แล้วเพิ่ม version ของ collection ใน bumps
 *   getSecret()           → คีย์สำหรับเซ็น session cookie (สร้างครั้งแรกแล้วเก็บไว้)
 */
const crypto = require('node:crypto');

const META = '_meta';

class FirestoreStore {
  constructor(opts = {}) {
    const { Firestore, FieldValue } = require('@google-cloud/firestore');
    this.db = new Firestore(opts.projectId ? { projectId: opts.projectId } : {});
    this.FieldValue = FieldValue;
  }

  async load(name) {
    const snap = await this.db.collection(name).get();
    return snap.docs.map((d) => ({ ...d.data(), _row: d.id }));
  }

  async getMeta() {
    const doc = await this.db.collection(META).doc('state').get();
    return doc.exists ? { versions: doc.data().versions || {} } : { versions: {} };
  }

  newId(name) {
    return this.db.collection(name).doc().id;
  }

  async commit(ops, bumps) {
    // Firestore batch รับได้ 500 รายการ — แบ่งเป็นชุด (meta อยู่ชุดสุดท้าย)
    const CHUNK = 450;
    for (let i = 0; i < ops.length || i === 0; i += CHUNK) {
      const batch = this.db.batch();
      ops.slice(i, i + CHUNK).forEach((op) => batch.set(this.db.collection(op.name).doc(op.id), op.data));
      if (i + CHUNK >= ops.length && bumps.length) {
        const versions = {};
        bumps.forEach((n) => { versions[n] = this.FieldValue.increment(1); });
        batch.set(this.db.collection(META).doc('state'), { versions }, { merge: true });
      }
      await batch.commit();
      if (!ops.length) break;
    }
  }

  async getSecret() {
    const ref = this.db.collection(META).doc('secret');
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (doc.exists && doc.data().session) return doc.data().session;
      const s = crypto.randomBytes(32).toString('hex');
      tx.set(ref, { session: s });
      return s;
    });
  }

  /** ใช้ตอน migrate: ลบทุก document ใน collection */
  async clear(name) {
    for (;;) {
      const snap = await this.db.collection(name).limit(400).get();
      if (snap.empty) return;
      const batch = this.db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  async count(name) {
    const snap = await this.db.collection(name).count().get();
    return snap.data().count;
  }
}

/** ที่เก็บในหน่วยความจำ — ใช้ทดสอบและรันในเครื่อง (MEMORY_DB=1) */
class MemoryStore {
  constructor(seed = {}) {
    this.data = {};
    this.versions = {};
    this.seq = 0;
    this.commits = 0;
    this.failNext = false;
    Object.keys(seed).forEach((name) => {
      this.data[name] = {};
      seed[name].forEach((row, i) => {
        const id = row._row ? String(row._row) : this.newId(name);
        const copy = { ...row, _seq: row._seq || i + 1 };
        delete copy._row;
        this.data[name][id] = copy;
      });
    });
  }
  async load(name) {
    return Object.entries(this.data[name] || {}).map(([id, d]) => ({ ...JSON.parse(JSON.stringify(d)), _row: id }));
  }
  async getMeta() { return { versions: { ...this.versions } }; }
  newId() { return 'm' + (++this.seq).toString(36) + crypto.randomBytes(4).toString('hex'); }
  async commit(ops, bumps) {
    if (this.failNext) { this.failNext = false; throw new Error('simulated commit failure'); }
    ops.forEach((op) => { (this.data[op.name] = this.data[op.name] || {})[op.id] = JSON.parse(JSON.stringify(op.data)); });
    bumps.forEach((n) => { this.versions[n] = (this.versions[n] || 0) + 1; });
    this.commits++;
  }
  async getSecret() { return this.secret || (this.secret = crypto.randomBytes(32).toString('hex')); }
  async clear(name) { this.data[name] = {}; }
  async count(name) { return Object.keys(this.data[name] || {}).length; }
  /** แก้ข้อมูลจากภายนอก (จำลองอีก instance หรือ migrate) */
  externalSet(name, id, data) {
    (this.data[name] = this.data[name] || {})[id] = data;
    this.versions[name] = (this.versions[name] || 0) + 1;
  }
}

module.exports = { FirestoreStore, MemoryStore };
