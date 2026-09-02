// BI 车型码 → 名称显示层（全渠道车型榜 tab 专用）。
// 命名来源全部为外部官方确认，绝不编造：
// 1) 三个中文名为用户人工确认后沿用（历史 Preview 已验收）；
// 2) 其余 30 码 = CubeInStore masterdata 官方接口 2026-09-02 全量确认
//    （/masterdata/v2/modelslist/{code}/infos，33 码含 conception_code，
//    原始产物 ~/bi_probe/1299_data/sku_names_full.json）。
// 服务端 /api/v1/bi/sku-names 会定时同步 masterdata 官方 label 落 D1，
// 前端在静态精选之上用其兜底补码（useBiSkuNames），两层都只显示已确认名称。
export const ALLCHANNEL_NAMES = {
  // 用户人工确认的中文显示名（保留）
  '8640568': 'Fit3 Jr 儿童轮滑鞋',
  '8984795': 'EXPLORE 900 24" 青少年山地车',
  '8949264': 'RCR 骑行服',
  // masterdata 官方 label（2026-09-02 确认，英文原样）
  '8043622': 'DERAILLEUR HOUSING 2 M',
  '8381709': 'SADDLE COVER L',
  '8400142': 'H MF540 GREY GREEN',
  '8480236': 'TILT 100 BLACK CN',
  '8528147': 'NECK WARMER 100 BLACK/GREY',
  '8583724': 'TUC 520 ELOPS LF CN DARK BLUE',
  '8584663': 'DERAILER CABLE CN',
  '8584667': 'ROAD BRAKE CABLE CN',
  '8585071': 'HYC 920 RUNRIDE RACING CN',
  '8618643': '20" MOVE 100 CN',
  '8640163': 'BOTTLE CAGE SIDE ENTRY',
  '8733846': 'MOVE 900 KHAKI',
  '8736087': 'MUDGUARD 20"-24" CN NON SUSPENSION',
  '8797823': '20" EXPL 120 CN',
  '8871211': 'TRAINING WHEELS 500 14-16" CN',
  '8871303': '16" BIKE 500 RED CN',
  '8872192': 'KIDS BIKE KICKSTAND 14"',
  '8882002': 'RC 100 NEW SILVER CN',
  '8903325': 'KEY 120 2025',
  '8915980': 'MTB UNDERSHORT 500 M BLACK',
  '8927179': '26" EXPL 500 CN YELLOW',
  '8932670': '24" MOVE 100 CN',
  '8936255': 'HANDLBAR BAG CN',
  '8944122': "16'' 900 GREEN SHINY CN",
  '8946821': '14" BIKE 100 CN',
  '8967120': 'KID HELMET MOVE 500 WHITE CN',
  '8984793': '26"EXPL 900 HD CN RED',
  '8987064': 'TAAIEN SG GREY PHOTO',
  '9002783': 'MTB EXPL 50 V2 LIGHT GREY CN',
  '9010483': 'RC100 V3 CN SILVER'
}
