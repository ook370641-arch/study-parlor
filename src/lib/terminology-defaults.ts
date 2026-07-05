import type { Terminology } from '@shared/index'

export const DEFAULT_TERMINOLOGY: Required<Terminology> = {
  // 仪式动词
  sessionName: '夜话',
  libraryName: '卷宗',
  archiveVerb: '封存',
  transcriptName: '笔录',
  burnVerb: '焚毁',
  newTopicLabel: '新的小径',
  continuePrompt: '推开下一扇门',
  unsavedSessionLabel: '中断的笔录',

  // 模式与流程
  modeProgress: '探索新知',
  modeReview: '复习检测',
  newTopicMode: '全新主题',
  existingTopicMode: '已有主题',
  archiveConfirmTitle: '是否封存？一旦归档，就不再更改。',
  archiveDismiss: '暂不封存',
  archiveConfirm: '封存。它从此成为档案。',

  // 参数标签
  difficultyLabel: '审讯强度',
  temperatureLabel: '腔调',
  difficultyHigh: '强',
  difficultyMid: '中',
  difficultyLow: '弱',
  temperatureCold: '坚硬',
  temperatureNeutral: '适中',
  temperatureWarm: '活泼',

  // 界面名词
  profileNameLabel: '代号',
  profileFieldLabel: '领域',
  profileTextLabel: '侧写',
  topicInputLabel: '今夜想学',
  subTopicLabel: '细分方向',
  continueDirectionLabel: '续谈方向',
  requirementLabel: '附加要求',
  homeGreeting: '晚安',
  startButton: '开始',
  cancelButton: '撤回',
}
