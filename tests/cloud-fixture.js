// Test-only Firebase substitute. The browser harness aliases it explicitly;
// it is never imported by the application or its production build.
const initial = {
  'document-a': { id: 'legacy-wrong-id', name: '雲端甲', userId: 'test-user', positions: [], closedPositions: [], sortOrder: 0 },
  'document-b': { id: 'document-b', name: '雲端乙', userId: 'test-user', positions: [], closedPositions: [], sortOrder: 1 },
};
let docs = JSON.parse(localStorage.getItem('fixture-documents') || JSON.stringify(initial));
const listeners = new Set();
const snapshot = (id) => ({ id, exists: () => !!docs[id], data: () => structuredClone(docs[id]) });
const notify = () => {
  localStorage.setItem('fixture-documents', JSON.stringify(docs));
  listeners.forEach(listener => listener({ docs: Object.keys(docs).map(snapshot), metadata: { fromCache: false, hasPendingWrites: false } }));
};
const control = window.cloudFixture = {
  failure: '', hold: false, writes: [], release: null,
  documents: () => structuredClone(docs),
  replace: (next) => { docs = next; notify(); },
};
async function commit(changes) {
  control.writes.push(changes);
  if (control.hold) {
    control.hold = false;
    await new Promise(resolve => { control.release = resolve; });
  }
  if (control.failure) {
    const code = control.failure; control.failure = '';
    throw Object.assign(new Error(code), { code });
  }
  for (const change of changes) {
    if (change.type === 'update' && !docs[change.id]) throw Object.assign(new Error('not-found'), { code: 'not-found' });
  }
  changes.forEach(({ type, id, value }) => {
    if (type === 'delete') delete docs[id];
    else docs[id] = type === 'update' ? { ...docs[id], ...value } : value;
  });
  notify();
}
export const auth = { currentUser: { uid: 'test-user', email: 'test@example.invalid' } };
export const db = {};
export const loginWithGoogle = async () => {};
export const logout = async () => {};
export const onAuthStateChanged = (_auth, next) => {
  const timer = setTimeout(() => next(auth.currentUser), 0);
  return () => clearTimeout(timer);
};
export const collection = () => ({});
export const query = () => ({});
export const where = () => ({});
export const doc = (_db, _collection, id) => ({ id });
export const onSnapshot = (_query, _options, next) => {
  listeners.add(next);
  queueMicrotask(() => { if (listeners.has(next)) notify(); });
  return () => listeners.delete(next);
};
export const setDoc = (ref, value) => commit([{ type: 'set', id: ref.id, value }]);
export const updateDoc = (ref, value) => commit([{ type: 'update', id: ref.id, value }]);
export const writeBatch = () => {
  const changes = [];
  return { update: (ref, value) => changes.push({ type: 'update', id: ref.id, value }), commit: () => commit(changes) };
};
export const runTransaction = async (_db, work) => {
  const changes = [];
  await work({
    get: async ref => snapshot(ref.id),
    set: (ref, value) => changes.push({ type: 'set', id: ref.id, value }),
    update: (ref, value) => changes.push({ type: 'update', id: ref.id, value }),
    delete: ref => changes.push({ type: 'delete', id: ref.id }),
  });
  await commit(changes);
};
