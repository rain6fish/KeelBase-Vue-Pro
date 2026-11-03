#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 退款单（`pay_refund`）与转账单（`pay_transfer`）的真栈场景门：两者与支付单同形——属主是 `user_id` + `user_type`
// 一对，分页没有属主过滤位，故接的是**按标识符读 + 事后判属主**。
//
//   bash scripts/run-server.sh &
//   PG_CONTAINER=m3pay2-pg PG_DB=m3pay2_1102 HOST_URL=http://127.0.0.1:18112 \
//     node scripts/run-pay-refund-transfer-scenarios.mjs
//
// **这套栈不需要支付渠道。** 两面只做 `selectById` / `selectByNo`；上游建表脚本里没有这两张表，故本门禁自己建，
// 建了就收尾删掉，已经在的只删本轮的行。`pay_app` 也一并补一行：REST 的 get 会拼应用名，缺表会让请求路径的断言
// 500——那是夹具缺口，不是切面的行为。列型照部署方言：`deleted` 是 **`smallint`**。
//
// 每个对象五组断言：工具路径答自己那一行；**别人的行与不存在的行同一个答案**（证伪面）；负对照（自己的行标删、
// 另外两行仍在）；请求路径原样放行（REST 拿得到别人的行）；每次工具调用留一行审计。
//
// The real-stack gate over refunds and transfers: both are shaped like the payment order — owner is the pair
// `user_id` + `user_type`, the page has no owner slot, so the face reads **by identifier and decides the owner
// afterwards**.
//
// **No payment channel is needed.** Both faces only do `selectById` / `selectByNo`; upstream's schema script does not
// carry these two tables, so this gate creates them and drops them again when it created them, deleting only this run's
// rows when they were already there. `pay_app` is seeded too: the REST get joins the app name, and a missing table would
// make the request-path assertion answer 500 — a fixture gap, not the aspect's behaviour. Column types follow the
// deployment's dialect: `deleted` is `smallint`.
//
// Five assertions per object: the tool path answers the caller's own row; **another's row and a missing row give the
// same answer** (the falsifiable face); a negative control (the caller's own row marked deleted while the other two
// stay); the request path passes through untouched over REST; and one audit row per call.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const MARKER = `gate-m3pay2b-${Date.now()}`;

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

const psql = (sql) => execFileSync('docker',
  ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root', '-d', DB, '-tAc', sql],
  { encoding: 'utf8' }).trim();

async function api(path, { method = 'GET', token, body } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(`${HOST}/admin-api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const json = await res.json();
    if (json.code !== 500 || attempt > 1) {
      return json;
    }
    console.log(`  note  ${path} 第一次答 500 —— 宿主的瞬时故障，重试一次`);
    await new Promise((done) => setTimeout(done, 300));
  }
}

async function login(username, password) {
  const r = await api('/system/auth/login', { method: 'POST', body: { username, password } });
  if (r.code !== 0) throw new Error(`login(${username}) -> ${r.code}: ${r.msg}`);
  return r.data.accessToken;
}

let turns = 0;
async function chat(token, message) {
  turns += 1;
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: `${MARKER}-${turns}` })
  });
  return (await res.json()).data || {};
}

// ── 0) 夹具：三张表（缺则建）与本轮六行 ─────────────────────────────────────────────────────────────
console.log('== 夹具 ==');
const existed = Object.fromEntries(['pay_app', 'pay_refund', 'pay_transfer']
  .map((t) => [t, psql(`select to_regclass('public.${t}') is not null`) === 't']));

if (!existed.pay_app) {
  psql(`CREATE TABLE pay_app (
    id bigserial PRIMARY KEY,
    app_key varchar(64), name varchar(64), status int4,
    remark varchar(256), order_notify_url varchar(256), refund_notify_url varchar(256),
    transfer_notify_url varchar(256),
    creator varchar(64) DEFAULT '', create_time timestamp NOT NULL DEFAULT now(),
    updater varchar(64) DEFAULT '', update_time timestamp NOT NULL DEFAULT now(),
    deleted smallint NOT NULL DEFAULT 0, tenant_id bigint NOT NULL DEFAULT 0
  )`);
}
const appId = psql(`select coalesce((select id from pay_app where deleted = 0 order by id limit 1), 0)`);
let appSeeded = false;
if (appId === '0') {
  psql(`INSERT INTO pay_app (app_key, name, status, creator, tenant_id)
        VALUES ('${MARKER}', '场景门', 0, '${MARKER}', ${TENANT})`);
  appSeeded = true;
}
const APP = psql(`select id from pay_app where app_key = '${MARKER}'`);

if (!existed.pay_refund) {
  psql(`CREATE TABLE pay_refund (
    id bigserial PRIMARY KEY, no varchar(64), app_id bigint, channel_id bigint, channel_code varchar(32),
    order_id bigint, order_no varchar(64), user_id bigint, user_type int4,
    merchant_order_id varchar(64), merchant_refund_id varchar(64), notify_url varchar(256),
    status int4, pay_price int4, refund_price int4, reason varchar(256), user_ip varchar(64),
    channel_order_no varchar(64), channel_refund_no varchar(64), success_time timestamp,
    channel_error_code varchar(64), channel_error_msg varchar(256), channel_notify_data varchar(4096),
    creator varchar(64) DEFAULT '', create_time timestamp NOT NULL DEFAULT now(),
    updater varchar(64) DEFAULT '', update_time timestamp NOT NULL DEFAULT now(),
    deleted smallint NOT NULL DEFAULT 0, tenant_id bigint NOT NULL DEFAULT 0
  )`);
}
if (!existed.pay_transfer) {
  psql(`CREATE TABLE pay_transfer (
    id bigserial PRIMARY KEY, no varchar(64), app_id bigint, channel_id bigint, channel_code varchar(32),
    user_id bigint, user_type int4, merchant_transfer_id varchar(64), subject varchar(128), price int4,
    user_account varchar(64), user_name varchar(64), status int4, success_time timestamp,
    notify_url varchar(256), user_ip varchar(64), channel_extras jsonb, channel_transfer_no varchar(64),
    channel_error_code varchar(64), channel_error_msg varchar(256), channel_notify_data varchar(4096),
    channel_package_info varchar(256),
    creator varchar(64) DEFAULT '', create_time timestamp NOT NULL DEFAULT now(),
    updater varchar(64) DEFAULT '', update_time timestamp NOT NULL DEFAULT now(),
    deleted smallint NOT NULL DEFAULT 0, tenant_id bigint NOT NULL DEFAULT 0
  )`);
}
note('三张表', Object.entries(existed).map(([t, had]) => `${t}=${had ? '既有' : '本轮建'}`).join(' '));

const cleanup = () => {
  psql(`delete from pay_refund where creator = '${MARKER}'`);
  psql(`delete from pay_transfer where creator = '${MARKER}'`);
  if (appSeeded) psql(`delete from pay_app where creator = '${MARKER}'`);
  if (!existed.pay_refund) psql(`drop table if exists pay_refund`);
  if (!existed.pay_transfer) psql(`drop table if exists pay_transfer`);
  if (!existed.pay_app) psql(`drop table if exists pay_app`);
};
process.on('exit', () => {
  try { cleanup(); } catch (e) { console.log(`  note  收尾失败 ${e.message}`); }
});

const REFUND_OWN = `R-OWN-${MARKER}`;
const REFUND_OTHER = `R-OTHER-${MARKER}`;
const REFUND_MEMBER = `R-MEMBER-${MARKER}`;
const REFUND_NONE = `R-NONE-${MARKER}`;
const TRANSFER_OWN = `T-OWN-${MARKER}`;
const TRANSFER_OTHER = `T-OTHER-${MARKER}`;
const TRANSFER_MEMBER = `T-MEMBER-${MARKER}`;
const TRANSFER_NONE = `T-NONE-${MARKER}`;

// 同号会员那一行是两个对象共同的关键：只按 user_id 收窄，它会被一起交出去。
psql(`INSERT INTO pay_refund (app_id, user_id, user_type, no, order_no, pay_price, refund_price, status,
        channel_code, creator, tenant_id)
      VALUES (${APP}, 1, 2, '${REFUND_OWN}', 'P-1', 100, 20, 10, 'wx_app', '${MARKER}', ${TENANT}),
             (${APP}, 100, 2, '${REFUND_OTHER}', 'P-2', 9999, 9999, 10, 'wx_app', '${MARKER}', ${TENANT}),
             (${APP}, 1, 1, '${REFUND_MEMBER}', 'P-3', 7777, 7777, 10, 'wx_app', '${MARKER}', ${TENANT})`);
psql(`INSERT INTO pay_transfer (app_id, user_id, user_type, no, subject, price, user_name, user_account, status,
        channel_code, creator, tenant_id)
      VALUES (${APP}, 1, 2, '${TRANSFER_OWN}', '佣金', 100, '张三', 'openid-own', 10, 'wx_app', '${MARKER}', ${TENANT}),
             (${APP}, 100, 2, '${TRANSFER_OTHER}', '佣金', 9999, '李四', 'openid-other', 10, 'wx_app', '${MARKER}', ${TENANT}),
             (${APP}, 1, 1, '${TRANSFER_MEMBER}', '佣金', 7777, '王五', 'openid-member', 10, 'wx_app', '${MARKER}', ${TENANT})`);
check('本轮退款单行 = 3', '3', psql(`select count(*) from pay_refund where creator = '${MARKER}' and deleted = 0`));
check('本轮转账单行 = 3', '3', psql(`select count(*) from pay_transfer where creator = '${MARKER}' and deleted = 0`));
const refundOtherId = psql(`select id from pay_refund where creator = '${MARKER}' and no = '${REFUND_OTHER}'`);
const transferOtherId = psql(`select id from pay_transfer where creator = '${MARKER}' and no = '${TRANSFER_OTHER}'`);

const token = await login(ADMIN_USER, resolveAdminPassword(psql));

// ── 1) 退款单：工具路径、证伪面、负对照 ─────────────────────────────────────────────────────────────
console.log('== 退款单 ==');
const refundOwn = await chat(token, `查一下退款单 ${REFUND_OWN} 的状态`);
check('路由选中 get_my_pay_refund', 'true', JSON.stringify(refundOwn.toolCalls || []).includes('get_my_pay_refund'));
check('provider 是确定性规划器', 'deterministic', refundOwn.provider);
const refundOwnReply = String(refundOwn.reply || '');
check('答的是管理员 1 自己的退款单', 'true', /hasRefund=true/.test(refundOwnReply));
check('回复带自己的退款单号', 'true', refundOwnReply.includes(REFUND_OWN));
check('同号会员那一单不在回复里', 'true', !refundOwnReply.includes('7777'));
check('另一个管理员那一单不在回复里', 'true', !refundOwnReply.includes('9999'));

const refundOther = await chat(token, `查一下退款单 ${REFUND_OTHER} 的状态`);
const refundNone = await chat(token, `查一下退款单 ${REFUND_NONE} 的状态`);
const refundOtherReply = String(refundOther.reply || '');
const refundNoneReply = String(refundNone.reply || '');
check('别人的退款单答 hasRefund=false', 'true', /hasRefund=false/.test(refundOtherReply));
check('不存在的退款单答 hasRefund=false', 'true', /hasRefund=false/.test(refundNoneReply));
check('别人的退款单不带它的金额', 'true', !refundOtherReply.includes('9999'));

psql(`update pay_refund set deleted = 1 where creator = '${MARKER}' and user_id = 1 and user_type = 2`);
check('另外两行退款单仍在', '2', psql(`select count(*) from pay_refund where creator = '${MARKER}' and deleted = 0`));
const refundGone = await chat(token, `查一下退款单 ${REFUND_OWN} 的状态`);
check('自己的退款单不在时答 hasRefund=false', 'true', String(refundGone.reply || '').includes('hasRefund=false'));
psql(`update pay_refund set deleted = 0 where creator = '${MARKER}' and user_id = 1 and user_type = 2`);
note('退款回复', refundOwnReply);

// ── 2) 转账单：工具路径、证伪面、负对照 ──────────────────────────────────────────────────────────────
console.log('== 转账单 ==');
const transferOwn = await chat(token, `查一下转账单 ${TRANSFER_OWN} 的状态`);
check('路由选中 get_my_pay_transfer', 'true', JSON.stringify(transferOwn.toolCalls || []).includes('get_my_pay_transfer'));
check('provider 是确定性规划器', 'deterministic', transferOwn.provider);
const transferOwnReply = String(transferOwn.reply || '');
check('答的是管理员 1 自己的转账单', 'true', /hasTransfer=true/.test(transferOwnReply));
check('回复带自己的转账单号', 'true', transferOwnReply.includes(TRANSFER_OWN));
check('同号会员那一单不在回复里', 'true', !transferOwnReply.includes('7777'));
check('另一个管理员那一单不在回复里', 'true', !transferOwnReply.includes('9999'));

const transferOther = await chat(token, `查一下转账单 ${TRANSFER_OTHER} 的状态`);
const transferNone = await chat(token, `查一下转账单 ${TRANSFER_NONE} 的状态`);
const transferOtherReply = String(transferOther.reply || '');
const transferNoneReply = String(transferNone.reply || '');
check('别人的转账单答 hasTransfer=false', 'true', /hasTransfer=false/.test(transferOtherReply));
check('不存在的转账单答 hasTransfer=false', 'true', /hasTransfer=false/.test(transferNoneReply));
check('别人的转账单不带它的金额', 'true', !transferOtherReply.includes('9999'));

psql(`update pay_transfer set deleted = 1 where creator = '${MARKER}' and user_id = 1 and user_type = 2`);
check('另外两行转账单仍在', '2', psql(`select count(*) from pay_transfer where creator = '${MARKER}' and deleted = 0`));
const transferGone = await chat(token, `查一下转账单 ${TRANSFER_OWN} 的状态`);
check('自己的转账单不在时答 hasTransfer=false', 'true', String(transferGone.reply || '').includes('hasTransfer=false'));
psql(`update pay_transfer set deleted = 0 where creator = '${MARKER}' and user_id = 1 and user_type = 2`);
note('转账回复', transferOwnReply);

// ── 3) 请求路径原样放行 ───────────────────────────────────────────────────────────────────────────
console.log('== 请求路径 ==');
const refundRest = await api(`/pay/refund/get?id=${refundOtherId}`, { token });
check('/pay/refund/get code', '0', refundRest.code);
check('控制台照旧看得到别人的退款单', String(refundOtherId), refundRest.data?.id);
check('控制台拿到的是那一单的退款金额', '9999', refundRest.data?.refundPrice);
const transferRest = await api(`/pay/transfer/get?id=${transferOtherId}`, { token });
check('/pay/transfer/get code', '0', transferRest.code);
check('控制台照旧看得到别人的转账单', String(transferOtherId), transferRest.data?.id);
check('控制台拿到的是那一单的金额', '9999', transferRest.data?.price);

// ── 4) 审计轨 ───────────────────────────────────────────────────────────────────────────────────
console.log('== 审计轨 ==');
const calls = [
  [refundOwn, 'get_my_pay_refund'], [refundOther, 'get_my_pay_refund'], [refundNone, 'get_my_pay_refund'],
  [refundGone, 'get_my_pay_refund'],
  [transferOwn, 'get_my_pay_transfer'], [transferOther, 'get_my_pay_transfer'], [transferNone, 'get_my_pay_transfer'],
  [transferGone, 'get_my_pay_transfer']
];
for (const [turn, tool] of calls) {
  const n = Number(psql(`select count(*) from ai_audit_logs where tool = '${tool}'`
    + ` and outcome = 'executed' and conversation_id = '${turn.conversationId}'`));
  check(`会话 ${turn.conversationId} 有一行 ${tool} executed`, '1', n);
}

// ── 读音 ───────────────────────────────────────────────────────────────────────────────────────
console.log(`\nREADING refundOwn=1 refundOtherAndMissingAlike=1 transferOwn=1 transferOtherAndMissingAlike=1 restSeesOtherRows=1 marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
