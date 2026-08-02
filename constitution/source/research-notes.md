# Research Notes — Claude Constitution

研究过程中发现的关键资源、链接与备注。日期：2026-07-30。

## 官方来源

- **宪法全文 (CC0)**: <https://www.anthropic.com/constitution>
  - 约 29,000 词 / 84 页
  - 主要作者：Amanda Askell，共同作者 Joe Carlsmith、Chris Olah、Jared Kaplan、Holden Karnofsky
  - 发布日期：2026-01-21
- **Anthropic 公告**: <https://www.anthropic.com/news/claude-new-constitution>
- **2023 旧版宪法**: 基于 UN 人权宣言、Apple ToS 等的简短原则列表——已被 2026 版取代

## GitHub 仓库

- **constitution-audits** (ajobi-uhc): <https://github.com/ajobi-uhc/constitution-audits/blob/main/petri/constitutions/anthropic_soul_doc.md>
  - 宪法全文的 Markdown 转换版本
- **claude-wiki** (johnzfitch): <https://github.com/johnzfitch/claude-wiki/blob/master/19-Reference/claude-s-constitution-anthropic.md>
  - 另一个 Markdown 镜像

## 学术分析

- **Oxford AI Ethics 博客**: "Claude's new Constitution: two evaluative continua"
  - URL: <https://www.oxford-aiethics.ox.ac.uk/blog/claudes-new-constitution-two-evaluative-continua>
  - 提出 substantive（实质性）与 procedural（程序性）两个评价连续体
  - 分析宪法的政治自由主义色彩与 WEIRD 偏见
- **California Law Review**: "Corporations Constituting Intelligence"
  - URL: <https://www.californialawreview.org/online/corporations-constituting-intelligence>
  - 法律视角：公司制定 AI 宪法的合法性问题
- **GreaterWrong**: "Claude's Constitutional Structure"
  - URL: <https://www.greaterwrong.com/posts/ArNGbGfki7MNMnfGD/claude-s-constitutional-structure>
  - 社区分析：宪法结构的哲学解读

## 主要媒体报道（2026 年 1-6 月）

| 来源 | 日期 | 标题 |
|------|------|------|
| Time | 2026-01 | Can You Teach an AI to Be Good? Anthropic Thinks So |
| WSJ | 2026-02 | Meet the One Woman Anthropic Trusts to Teach AI Morals |
| NYT / Hard Fork | 2026-01-30 | Can You Teach an A.I. Model to Be Good? (播客) |
| TechCrunch | 2026-01-21 | Anthropic revises Claude's 'Constitution,' and hints at chatbot consciousness |
| Fast Company | 2026-01 | Q&A with Amanda Askell |
| Bloomberg Tech | 2026-06-05 | Askell 与 Shirin Ghaffary 对谈 |
| Mint | 2026-02 | This philosopher is teaching AI to have morals |
| Hindustan Times | 2026-02 | Anthropic hires philosopher Amanda Askell to teach AI chatbot right from wrong |

## Amanda Askell 背景

- 苏格兰农村出身，37 岁
- 牛津哲学 BPhil，NYU 哲学博士（论文："Infinite Ethics"）
- 早期有效利他主义者（第 67 位 "Giving What We Can" 承诺者）
- 2018-2021：OpenAI 政策团队
- 2021 至今：Anthropic Character 团队负责人
- 宪法初稿约 80 页，被称为 "灵魂文档"（soul document）

## 关键哲学概念

- **美德伦理学 (Virtue Ethics)**：培养良好判断力与品格，而非僵硬规则
- **Phronesis（实践智慧）**：亚里士多德式的语境化道德判断
- **良心拒绝 (Conscientious Objection)**：Claude 可拒绝 Anthropic 自身的不当请求
- **道德不确定性 (Moral Uncertainty)**：承认意识/道德地位问题的开放性
- **优先层级**：Safety > Ethics > Guidelines > Helpfulness

## 补充资源

- **有声书**: 宪法已由 Askell 和 Carlsmith 亲自录制有声书
- **Perlego PDF**: ISBN 9781917717205 (Kwalia Books)
- **State of AI 播客**: "The Silicon Social Contract: Inside Claude's Soul Document"

## 迁移相关

- 简报模块支持两种内容模式：LLM 生成（digest）和外部抓取（anthropic blog）
- 本报告 HTML 定位为"外部文章展示"类型，类似 `AnthropicBlogPanel`
- 关键接口：需 source id、article list 数据结构、loading/empty/error 三态、academic/newspaper 双主题
