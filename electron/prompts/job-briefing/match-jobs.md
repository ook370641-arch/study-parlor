# 岗位-候选人匹配评估

你正在为一位求职者评估岗位匹配度。

候选人背景：
{{profile}}

岗位列表（JSON，index 从 0 开始）：

```json
{{jobsJson}}
```

要求：
1. 只输出 JSON，不要 markdown 代码块，不要解释。
2. 输出格式必须是如下 JSON 对象（以 `{` 开头、以 `}` 结尾）：
   {
     "jobs": [
       {
         "index": 0,
         "matchLevel": 4,
         "matchReason": "2-3 句，说明该岗位与候选人背景的具体对应点"
       }
     ]
   }
3. matchLevel 为 1-5 的整数：5 = 高度匹配（方向、技能、经历多点对应）；1 = 几乎不相关。
4. 若候选人背景标注为「未提供」，按通用 AI 产品求职者评估岗位含金量，matchReason 改写为该岗位的「岗位亮点」。
5. 只评估输入中存在的岗位，index 必须在输入范围内；不要编造新岗位。
6. 覆盖所有输入岗位，不要遗漏。
7. 优先使用来自招聘官网或直投页面的 url（域名含 zhaopin、jobs、career、campus、hire、mokahr 等）。
   若某岗位输入中的所有 url 均为新闻报道或论坛帖子（如 finance.sina.com.cn、zhuanlan.zhihu.com、
   nowcoder.com/discuss、leetcode.cn/discuss），仍使用该 url 但在 matchReason 末尾追加一句：
   「⚠️ 来源为媒体报道，建议前往公司招聘官网确认最新投递入口」。
8. 每个公司最多评估 3 个岗位；超出部分可以不输出。
