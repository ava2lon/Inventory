import { supabase, requireUser } from './supabase.js';

const OP_PREFIX = 'inv:op:v1:';

async function getValue(key) {
  const user = await requireUser();
  if (key.startsWith(OP_PREFIX)) {
    const id = key.slice(OP_PREFIX.length);
    const { data, error } = await supabase.from('inv_operations').select('payload').eq('user_id', user.id).eq('id', id).maybeSingle();
    if (error) throw error;
    return data?.payload ?? null;
  }
  const { data, error } = await supabase.from('inv_kv').select('value').eq('user_id', user.id).eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}
async function setValue(key, value) {
  const user = await requireUser();
  if (key.startsWith(OP_PREFIX)) {
    const id = key.slice(OP_PREFIX.length);
    if (!/^[0-9a-f-]{36}$/i.test(id) || value?.id !== id || !Number.isSafeInteger(value?.clock) || value.clock < 1) throw new Error('Invalid immutable inventory operation.');
    const { error } = await supabase.from('inv_operations').insert({ user_id: user.id, id, clock: value.clock, payload: value });
    if (!error) return true;
    if (error.code !== '23505') throw error;
    const existing = await getValue(key);
    if (JSON.stringify(existing) !== JSON.stringify(value)) throw new Error('An operation ID already exists with a different payload.');
    return true;
  }
  const { error } = await supabase.from('inv_kv').upsert({ user_id: user.id, key, value }, { onConflict: 'user_id,key' });
  if (error) throw error;
  return true;
}
async function deleteValue(key) {
  const user = await requireUser();
  if (key.startsWith(OP_PREFIX)) throw new Error('Inventory operation history is append-only.');
  const { error } = await supabase.from('inv_kv').delete().eq('user_id', user.id).eq('key', key);
  if (error) throw error;
  return true;
}
async function listKeys(pattern) {
  const user = await requireUser();
  const prefix = String(pattern || '').replace(/\*$/, '');
  if (prefix.startsWith(OP_PREFIX)) {
    const rows = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await supabase.from('inv_operations').select('id').eq('user_id', user.id)
        .order('clock', { ascending: true }).order('id', { ascending: true }).range(from, from + size - 1);
      if (error) throw error;
      rows.push(...(data || []).map((row) => OP_PREFIX + row.id));
      if (!data || data.length < size) break;
    }
    return rows.filter((key) => key.startsWith(prefix));
  }
  const { data, error } = await supabase.from('inv_kv').select('key').eq('user_id', user.id).like('key', prefix + '%');
  if (error) throw error;
  return (data || []).map((row) => row.key);
}
export const cloudKV = Object.freeze({ get: getValue, set: setValue, del: deleteValue, list: listKeys });
