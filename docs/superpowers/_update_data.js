const fs = require('fs');
const path = 'docs/superpowers/text-review-prototype.html';
let content = fs.readFileSync(path, 'utf8');

const dataStart = content.indexOf('const DATA = {');
const dataEnd = content.indexOf('};\n\n// ==================== STATE ====================') + 2;

if (dataStart === -1 || dataEnd <= 2) {
  console.error('DATA block not found');
  process.exit(1);
}

const before = content.slice(0, dataStart);
const after = content.slice(dataEnd);

const newData = `const DATA = {
  cover: {
    label: '封面',
    file: 'Cover.tsx',
    items: [
      { key: 'cover_greeting', orig: '夜深了,', light: '夜深了', medium: '又一个人', heavy: '档案室只剩你', ctx: '问候语' },
      { key: 'cover_start', orig: '开始学习', light: '开始学习', medium: '打开档案', heavy: '提交夜间学习申请', ctx: '主按钮' },
      { key: 'cover_name_hint', orig: '第一次到来,告诉我你的名字', light: '告诉我你的名字', medium: '档案需署名', heavy: '此处填写申请人编号，即你的名字', ctx: '新用户提示' },
      { key: 'cover_enter', orig: '进入夜话', light: '进入', medium: '准入', heavy: '盖章通过', ctx: '确认按钮' },
    ]
  },
  home: {
    label: '主页',
    file: 'Home.tsx',
    items: [
      { key: 'home_profile', orig: '档案', light: '档案', medium: '卷宗', heavy: '个人卷宗调阅', ctx: '右上角按钮' },
      { key: 'home_greeting', orig: '晚安,', light: '还没睡', medium: '又是你', heavy: '值班室又亮了', ctx: '顶部问候' },
      { key: 'home_unsaved_title', orig: '未完成的会话', light: '未完成的会话', medium: '中断的笔录', heavy: '一份未归档的夜间笔录', ctx: '恢复提示标题' },
      { key: 'home_resume', orig: '继续', light: '继续', medium: '接着读', heavy: '从折痕处展开', ctx: '恢复链接' },
      { key: 'home_discard', orig: '丢弃', light: '丢弃', medium: '焚毁', heavy: '按作废处理', ctx: '丢弃链接' },
      { key: 'home_start', orig: '开始新学习', light: '开始学习', medium: '开新卷', heavy: '申请新的夜间调查', ctx: '主按钮' },
      { key: 'home_rec_title', orig: '从已知推未知', light: '从已知推未知', medium: '已知档案的延伸', heavy: '根据既有卷宗，推断下一扇门的方位', ctx: '推荐区块标题' },
      { key: 'home_library', orig: '学习库', light: '学习库', medium: '档案室', heavy: '夜间档案室', ctx: '右侧标题' },
    ]
  },
  prestudy: {
    label: '预学习弹窗',
    file: 'PreStudyModal.tsx',
    items: [
      { key: 'ps_mode_progress', orig: '推进 · 苏格拉底式探索', light: '探索新知', medium: '苏格拉底式盘问', heavy: '以问题为灯，在未知走廊里摸索', ctx: '推进模式说明' },
      { key: 'ps_mode_review', orig: '检测 · 掌握度复习', light: '复习检测', medium: '掌握度审查', heavy: '检查你身体记得、嘴巴却说不出的事', ctx: '检测模式说明' },
      { key: 'ps_topic_label', orig: '今夜想学', light: '今夜想学', medium: '今晚的调查对象', heavy: '今夜，你想把什么放进嘴里咀嚼', ctx: '输入标签' },
      { key: 'ps_topic_placeholder', orig: '主题或一个问题', light: '主题或问题', medium: '一个问题，或一个念头', heavy: '任何让你半夜醒来的东西', ctx: '占位符' },
      { key: 'ps_diff_label', orig: '难度', light: '难度', medium: '盘问力度', heavy: '审讯强度', ctx: '难度标签' },
      { key: 'ps_diff_high', orig: '高', light: '高', medium: '不留情', heavy: '追至墙角', ctx: '难度选项' },
      { key: 'ps_diff_mid', orig: '中', light: '中', medium: '有来有回', heavy: '互相试探', ctx: '难度选项' },
      { key: 'ps_diff_low', orig: '低', light: '低', medium: '慢慢来', heavy: '先暖暖场', ctx: '难度选项' },
      { key: 'ps_temp_label', orig: '温度', light: '温度', medium: '腔调', heavy: '档案室的温度', ctx: '温度标签' },
      { key: 'ps_cancel', orig: '取消', light: '取消', medium: '撤回', heavy: '申请作废', ctx: '取消按钮' },
      { key: 'ps_start', orig: '开始', light: '开始', medium: '启动', heavy: '盖章，开始', ctx: '开始按钮' },
      { key: 'greeting_suffix', orig: '学者', light: '申请人', medium: '夜行者', heavy: '那个还没被归档的人', ctx: '问候后缀称呼' },
      { key: 'temp_0.3', orig: '0.3', light: '静', medium: '静水深流', heavy: '静水深流，不言不语', ctx: '温度按钮' },
      { key: 'temp_0.7', orig: '0.7', light: '常', medium: '如常', heavy: '如常，不紧不慢', ctx: '温度按钮' },
      { key: 'temp_1.0', orig: '1.0', light: '沸', medium: '即将沸腾', heavy: '即将沸腾，言语溢出边缘', ctx: '温度按钮' },
    ]
  },
  study: {
    label: '学习页',
    file: 'Study.tsx',
    items: [
      { key: 'st_back', orig: '返回', light: '退席', medium: '退席', heavy: '退席。门会自己合上。', ctx: '返回按钮' },
      { key: 'st_mode_progress', orig: '推进', light: '新卷', medium: '新卷调查中', heavy: '新卷调查——未知尚未归档', ctx: '模式指示器' },
      { key: 'st_mode_review', orig: '检测', light: '复检', medium: '复检旧卷', heavy: '复检——看看身体还记得多少', ctx: '模式指示器' },
      { key: 'st_diff_high', orig: '高', light: '深水区', medium: '深水区', heavy: '深水区，脚够不到底', ctx: '难度指示' },
      { key: 'st_diff_mid', orig: '中', light: '齐腰深', medium: '齐腰深', heavy: '齐腰深，能站稳但不好走', ctx: '难度指示' },
      { key: 'st_diff_low', orig: '低', light: '浅水区', medium: '浅水区', heavy: '浅水区，只湿到脚踝', ctx: '难度指示' },
      { key: 'st_temp_label', orig: 'T=', light: '腔调=', medium: '腔调=', heavy: '档案室的腔调=', ctx: '温度标签' },
      { key: 'st_retry', orig: '重试', light: '重递', medium: '重递申请', heavy: '重递——第一次总有纰漏', ctx: '重试按钮' },
      { key: 'st_close', orig: '关闭', light: '合上', medium: '先合上', heavy: '合上。它不会自己消失。', ctx: '关闭按钮' },
      { key: 'st_thinking', orig: '正在思考...', light: '整理中…', medium: '档案员在整理…', heavy: '档案员在暗室整理卷宗。等一等。', ctx: '加载状态' },
      { key: 'st_archive_ask', orig: 'AI 询问是否归档此次学习', light: '是否封存此次谈话？', medium: '是否将此次谈话封存归档？', heavy: '是否封存？一旦归档，就不再更改。', ctx: '归档通知' },
      { key: 'st_archive_no', orig: '暂不归档', light: '暂不封存', medium: '先不封存', heavy: '先摊开。有些卷宗需要时间风干。', ctx: '暂不按钮' },
      { key: 'st_archive_yes', orig: '归档此次学习', light: '封存', medium: '封存归档', heavy: '封存。它从此成为档案。', ctx: '归档按钮' },
    ]
  },
  'library-empty': {
    label: '学习库 · 空状态',
    file: 'StudyLibrary.tsx',
    items: [
      { key: 'lib_empty_title', orig: '你的星空还在等待', light: '档案室空着', medium: '档案室还空着', heavy: '档案室还空着。但空也是一种档案。', ctx: '空状态标题' },
      { key: 'lib_empty_desc', orig: '开始第一次学习，点亮第一颗星', light: '开第一份卷宗', medium: '开第一份卷宗。你不知道会记录什么。', heavy: '开第一份卷宗。你不知道会记录什么——也许是证词，也许是供词。', ctx: '空状态描述' },
      { key: 'lib_empty_btn', orig: '开始第一次学习', light: '开卷', medium: '开第一份卷宗', heavy: '递交第一份申请书', ctx: '空状态按钮' },
    ]
  },
  'library-pop': {
    label: '学习库 · 有内容',
    file: 'StudyLibrary.tsx',
    items: [
      { key: 'lib_tab_all', orig: '全部', light: '全部', medium: '全部卷宗', heavy: '全部卷宗——连作废的也在内', ctx: '筛选标签' },
      { key: 'lib_count_suffix', orig: '个 session', light: '份', medium: '份谈话', heavy: '份谈话记录', ctx: '计数后缀' },
      { key: 'lib_session_prefix', orig: 's', light: '第', medium: '第', heavy: '第', ctx: 'session前缀' },
      { key: 'lib_reviewed', orig: '✓ 已复习', light: '✓ 已复检', medium: '✓ 已复检', heavy: '✓ 已复检——但你确定看懂了？', ctx: '状态徽章' },
      { key: 'lib_unreviewed', orig: '✕ 未复习', light: '✕ 未复检', medium: '✕ 未复检', heavy: '✕ 未复检——它在抽屉里等你', ctx: '状态徽章' },
      { key: 'lib_report_btn', orig: '学习报告', light: '谈话记录', medium: '谈话记录', heavy: '谈话记录——你当时以为重要的', ctx: '文件按钮' },
      { key: 'lib_fable_btn', orig: '寓言', light: '包裹件', medium: '包裹件', heavy: '包裹件——借故事投递的密件', ctx: '文件按钮' },
      { key: 'lib_image_btn', orig: '图片', light: '附图', medium: '附图', heavy: '附图——一张图胜过千言', ctx: '文件按钮' },
      { key: 'lib_review_report', orig: '复习报告', light: '复检记录', medium: '复检记录', heavy: '复检记录——第二次读，味道不同', ctx: '复习报告按钮' },
      { key: 'lib_start_review', orig: '开始复习', light: '复检', medium: '取出复检', heavy: '取出复检。抽屉里积了灰。', ctx: '开始复习按钮' },
      { key: 'lib_continue', orig: '继续学习（第', light: '续谈（第', medium: '续谈（第', heavy: '续谈（第', ctx: '继续按钮前缀' },
      { key: 'lib_continue_suffix', orig: '次）', light: '次）', medium: '次）', heavy: '次）——你真的说完了吗？', ctx: '继续按钮后缀' },
      { key: 'lib_delete_tooltip', orig: '删除 session', light: '注销', medium: '注销此份', heavy: '注销此份。它曾存在过。', ctx: '删除tooltip' },
      { key: 'lib_prev_page', orig: '上一页', light: '前一屉', medium: '前一屉', heavy: '前一屉抽屉', ctx: '分页' },
      { key: 'lib_next_page', orig: '下一页', light: '后一屉', medium: '后一屉', heavy: '后一屉抽屉', ctx: '分页' },
      { key: 'lib_page_label', orig: '第 ', light: '第', medium: '第', heavy: '第', ctx: '分页标签前缀' },
      { key: 'lib_page_suffix', orig: ' 页', light: '屉', medium: '屉', heavy: '屉', ctx: '分页标签后缀' },
      { key: 'lib_del_title', orig: '删除 Session', light: '注销谈话', medium: '注销谈话记录', heavy: '注销谈话记录。连同当时的你。', ctx: '对话框标题' },
      { key: 'lib_del_confirm', orig: '彻底删除', light: '确认注销', medium: '确认注销', heavy: '确认注销。不可恢复。', ctx: '确认按钮' },
      { key: 'lib_del_body', orig: '即将彻底删除 ', light: '即将注销', medium: '即将注销此份记录', heavy: '即将注销此份记录。连同你在写它时的那个版本。', ctx: '对话框正文' },
      { key: 'lib_del_files', orig: '以下文件将被永久删除', light: '以下附件将一并销毁', medium: '以下附件将一并销毁', heavy: '以下附件将一并销毁。有些附件比正文更重要。', ctx: '文件列表说明' },
      { key: 'lib_del_warning', orig: '此操作不可撤销', light: '不可撤销', medium: '不可撤销。没有副本。', heavy: '不可撤销。没有副本。没有备份。', ctx: '警告' },
    ]
  },
  'archive-loading': {
    label: '归档加载',
    file: 'ArchiveLoadingOverlay.tsx',
    items: [
      { key: 'al_title', orig: '正在凝结记忆…', light: '归档中', medium: '正在归档', heavy: '记忆正在封存', ctx: '加载标题' },
      { key: 'al_desc', orig: 'AI 正在整理此次学习的笔记', light: '整理中', medium: '整理此次痕迹', heavy: '纸页在暗中自行归类', ctx: '加载描述' },
    ]
  },
  'archive-report': {
    label: '归档报告',
    file: 'ArchiveReportModal.tsx',
    items: [
      { key: 'ar_close', orig: '关闭', light: '合上', medium: '合上档案', heavy: '合上并离开', ctx: '关闭按钮' },
      { key: 'ar_doc_progress', orig: '学习报告', light: '新卷', medium: '新立案卷', heavy: '初次立案卷宗', ctx: '文档类型（学习会话）' },
      { key: 'ar_doc_review', orig: '复习报告', light: '续卷', medium: '续阅卷宗', heavy: '复核阅卷记录', ctx: '文档类型（复习会话）' },
      { key: 'ar_end_btn', orig: '本次学习结束', light: '结案', medium: '本案终结', heavy: '本案终结，归档', ctx: '底部按钮' },
    ]
  },
  'confirm-dialog': {
    label: '确认对话框',
    file: 'ConfirmDialog.tsx',
    items: [
      { key: 'cd_cancel', orig: '取消', light: '返回', medium: '不必了', heavy: '维持现状', ctx: '普通取消按钮' },
      { key: 'cd_rethink', orig: '再想想', light: '停手', medium: '手停在半空', heavy: '你还没有准备好', ctx: '危险取消按钮' },
    ]
  },
  profile: {
    label: '档案页',
    file: 'Profile.tsx',
    items: [
      { key: 'pf_title', orig: '个人档案', light: '你', medium: '你的卷宗', heavy: '身份与偏好卷宗', ctx: '页面标题' },
      { key: 'pf_back', orig: '返回', light: '退出', medium: '退出档案室', heavy: '离开档案室', ctx: '返回按钮' },
      { key: 'pf_name', orig: '姓名', light: '代号', medium: '登记名', heavy: '卷宗登记名', ctx: '姓名标签' },
      { key: 'pf_portrait', orig: '画像', light: '侧写', medium: '侧写画像', heavy: '自我侧写画像', ctx: '画像标签' },
      { key: 'pf_empty', orig: '(空)', light: '未填', medium: '此处空白', heavy: '此处尚未落笔', ctx: '空值显示' },
      { key: 'pf_topics', orig: '偏好领域', light: '领域', medium: '涉猎领域', heavy: '常涉足的领域', ctx: '偏好领域标签' },
      { key: 'pf_difficulty', orig: '默认难度', light: '深度', medium: '默认深度', heavy: '对话默认深度', ctx: '难度标签' },
      { key: 'pf_temperature', orig: '默认温度', light: '温度', medium: '默认温度', heavy: '对话默认温度', ctx: '温度标签' },
      { key: 'pf_edit', orig: '编辑', light: '改写', medium: '改写卷宗', heavy: '进入改写程序', ctx: '编辑按钮' },
      { key: 'pf_edit_title', orig: '编辑档案', light: '改写', medium: '改写卷宗', heavy: '改写身份卷宗', ctx: '编辑页标题' },
      { key: 'pf_portrait_hint', orig: '画像(自由文本)', light: '你是谁', medium: '你是谁（自由书写）', heavy: '你是谁——不必准确，只需诚实', ctx: '画像输入标签' },
      { key: 'pf_topics_hint', orig: '偏好领域(用 、 或 , 分隔)', light: '领域', medium: '领域（顿号或逗号分隔）', heavy: '领域——用顿号或逗号隔开', ctx: '领域输入标签' },
      { key: 'pf_save', orig: '保存', light: '落印', medium: '落印封存', heavy: '落印，封存', ctx: '保存按钮' },
      { key: 'pf_cancel', orig: '取消', light: '作废', medium: '作废修改', heavy: '作废此次修改', ctx: '取消按钮' },
    ]
  },
  'review-flash': {
    label: '复习闪动',
    file: 'ReviewFlash.tsx',
    items: [
      { key: 'rf_title', orig: '重温这颗星', light: '旧星', medium: '重返旧星', heavy: '重返一颗旧星', ctx: '闪动标题' },
    ]
  },
  'report-sections': {
    label: '报告区块标题',
    file: 'md/components.tsx',
    items: [
      { key: 'rs_concept', orig: '核心概念', light: '概念', medium: '被命名的东西', heavy: '你终于能叫出它的名字了', ctx: '报告区块' },
      { key: 'rs_record', orig: '学习记录', light: '记录', medium: '谈话副本', heavy: '归档员誊写的供词', ctx: '报告区块' },
      { key: 'rs_points', orig: '学习要点', light: '要点', medium: '带走的碎片', heavy: '你口袋里剩下的', ctx: '报告区块' },
      { key: 'rs_gaps', orig: '认知缺口', light: '缺口', medium: '尚未咬合处', heavy: '档案在此处缺页', ctx: '报告区块' },
      { key: 'rs_test', orig: '掌握检验', light: '检验', medium: '试着用它', heavy: '在黑暗中复述一遍', ctx: '报告区块' },
      { key: 'rs_future', orig: '未来发展建议', light: '下一步', medium: '未拆封的通道', heavy: '走廊尽头还有一扇门', ctx: '报告区块' },
      { key: 'rs_insight', orig: '洞见', light: '一闪', medium: '骨头里的响动', heavy: '你早知道，只是说不出', ctx: '报告区块' },
      { key: 'rs_code', orig: '代码示例', light: '代码', medium: '可执行的陈述', heavy: '机器能嚼碎的文字', ctx: '报告区块' },
      { key: 'rs_diagnosis', orig: '诊断阶段', light: '诊察', medium: '清点损伤', heavy: '先确认哪里在漏', ctx: '报告区块' },
      { key: 'rs_learning', orig: '学习阶段', light: '研习', medium: '缓慢的渗透', heavy: '身体在学会之前', ctx: '报告区块' },
      { key: 'rs_symptom', orig: '症状描述', light: '症状', medium: '哪里不对劲', heavy: '你感到却描述不清的', ctx: '报告区块' },
      { key: 'rs_mechanism', orig: '关键机制', light: '机制', medium: '齿轮如何咬合', heavy: '藏在面板后面的', ctx: '报告区块' },
      { key: 'rs_contradiction', orig: '矛盾点', light: '矛盾', medium: '文件互相否定', heavy: '两份档案无法并存', ctx: '报告区块' },
      { key: 'rs_effective', orig: '有效元素', light: '有效', medium: '确实起作用的部分', heavy: '你无意中做对的', ctx: '报告区块' },
      { key: 'rs_pending', orig: '待判断的问题', light: '待定', medium: '悬而未决的', heavy: '档案员拒绝盖章的', ctx: '报告区块' },
      { key: 'rs_end', orig: '结束', light: '止', medium: '此处终止', heavy: '卷宗到此结束', ctx: '报告区块' },
      { key: 'rs_fable', orig: '这个寓言真正讲的概念', light: '所指', medium: '它真正讲的东西', heavy: '故事咽下去后留下的', ctx: '报告区块' },
      { key: 'rs_user', orig: '用户', light: '你', medium: '来访者', heavy: '档案编号未知', ctx: '对话角色' },
    ]
  },
  'report-header': {
    label: '报告头部',
    file: 'md/ReportHeader.tsx',
    items: [
      { key: 'rh_type_progress', orig: '学习报告', light: '学习', medium: '学习卷宗', heavy: '一次未完成的勘探', ctx: '类型徽章' },
      { key: 'rh_type_review', orig: '复习报告', light: '复习', medium: '复检记录', heavy: '旧档案被重新翻动', ctx: '类型徽章' },
      { key: 'rh_type_research', orig: '研究报告', light: '研究', medium: '深度勘测', heavy: '对未知领土的正式申请', ctx: '类型徽章' },
      { key: 'rh_type_fable', orig: '寓言', light: '寓言', medium: '包裹着的', heavy: '借故事投递的密件', ctx: '类型徽章' },
      { key: 'rh_type_raw', orig: '原始对话', light: '原档', medium: '未编辑的谈话', heavy: '归档员尚未修剪的', ctx: '类型徽章' },
      { key: 'rh_diff_high', orig: '高难度', light: '艰深', medium: '需要咀嚼的', heavy: '准入门槛未被拆除', ctx: '难度徽章' },
      { key: 'rh_diff_mid', orig: '中等难度', light: '适中', medium: '有坡度的', heavy: '门开着，但有守卫', ctx: '难度徽章' },
      { key: 'rh_diff_low', orig: '入门', light: '平缓', medium: '门槛较低的', heavy: '门虚掩着', ctx: '难度徽章' },
      { key: 'rh_session', orig: 'Session #', light: '#', medium: '第N次谈话', heavy: '档案编号', ctx: '元数据' },
      { key: 'rh_review_count', orig: '第 x 次复习', light: 'x次', medium: '第x次复检', heavy: '第x次被取出翻阅', ctx: '元数据' },
      { key: 'rh_source', orig: '来源主题', light: '来自', medium: '缘起于', heavy: '由该主题签发', ctx: '来源标签' },
    ]
  },
  chatinput: {
    label: '聊天输入',
    file: 'ChatInput.tsx',
    items: [
      { key: 'ci_placeholder', orig: 'Enter 发送 / Shift+Enter 换行', light: '输入...', medium: '写下你想咀嚼的', heavy: 'Enter投递，Shift换行', ctx: '占位符' },
      { key: 'ci_send', orig: '发送', light: '递出', medium: '提交供词', heavy: '让档案员收录', ctx: '发送按钮' },
    ]
  },
  misc: {
    label: '杂项',
    file: 'Various',
    items: [
      { key: 'misc_swap', orig: '换一幅画', light: '换景', medium: '换一幅背景', heavy: '换一间房间', ctx: '换画按钮' },
      { key: 'misc_topic_prefix', orig: '今夜想学:', light: '关于', medium: '今夜入口', heavy: '你敲门时说的', ctx: '消息前缀' },
      { key: 'misc_raw_header', orig: '# 原始对话', light: '原档', medium: '未修剪的对话', heavy: '归档员尚未删改的', ctx: '归档内容头' },
      { key: 'misc_toast_archived', orig: '》已归档', light: '已存档', medium: '卷宗已入库', heavy: '档案员收下了', ctx: '归档Toast' },
      { key: 'misc_review_fallback', orig: '（本次复习未发现明显知识缺口）', light: '暂无缺口', medium: '未发现明显裂痕', heavy: '档案员摇头，表示完整', ctx: '复习回退' },
    ]
  }
};`;

fs.writeFileSync(path, before + newData + '\n\n' + after);
console.log('DATA replaced successfully');
console.log("DATA replaced successfully");
