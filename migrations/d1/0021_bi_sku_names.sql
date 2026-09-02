-- BI 车型码 → 官方品名（CubeInStore masterdata 定时同步落库）。
-- 供销售数据场景车型榜补名：前端静态 ALLCHANNEL_NAMES 为精选显示层（含用户
-- 人工确认的 3 码中文名），本表存 masterdata 官方 label 作为兜底与增量来源，
-- 前端合并显示，绝不编造名称。凭据与密钥全部走 Worker secret（AES-GCM 加密），
-- 上游 JWT 短时效、每次同步全新登录，不落任何持久凭据。
CREATE TABLE bi_sku_names (
  code TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  production_label TEXT,
  conception_code TEXT,
  product_type TEXT,
  synced_at TEXT NOT NULL
);
