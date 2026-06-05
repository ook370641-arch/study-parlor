import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { ipc } from '@/lib/ipc'

export function Extension() {
  const goto = useStore(s => s.goto)
  const [info, setInfo] = useState<{ libraryPath: string; paintingCount: number } | null>(null)

  useEffect(() => {
    ipc.getExtensionInfo().then(setInfo).catch(() => setInfo({ libraryPath: '未知', paintingCount: 0 }))
  }, [])

  return (
    <div className="fixed inset-0">
      <SurfaceBackground surface="home" />
      <SwapPaintingButton surface="home" className="absolute top-4 right-36 z-10" />

      <div className="absolute top-10 left-6 right-6 z-10">
        <div className="max-w-3xl mx-auto">
          <div className="bg-ink/72 backdrop-blur-md border border-slate/30 rounded-xl p-6">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate/25">
              <h2 className="text-2xl font-serif font-semibold">扩展</h2>
              <button
                onClick={() => goto('home')}
                className="text-parchment/70 hover:text-parchment text-sm bg-transparent border-none cursor-pointer font-sans"
              >
                返回夜话
              </button>
            </div>

            {/* Card 1: Library */}
            <div className="bg-parchment/5 border border-slate/20 rounded-lg p-4 mb-4">
              <h3 className="text-ember font-semibold mb-2 flex items-center gap-2">
                <span>📁</span> 学习库
              </h3>
              <div className="text-sm text-parchment/70 space-y-2">
                <div className="flex items-center gap-2">
                  <span>根目录：</span>
                  <code className="bg-ink px-2 py-0.5 rounded text-xs text-parchment/60">
                    {info?.libraryPath ?? '加载中...'}
                  </code>
                </div>
                <div className="bg-ink/40 border-l-2 border-ember/50 pl-3 py-2 text-xs text-parchment/50">
                  📌 扩展原理：所有学习内容统一保存到这里。<br />
                  学习报告（study）、复习记录、寓言故事（fable）、流程图 —— 全部写入本目录，应用自动扫描显示。
                </div>
              </div>
            </div>

            {/* Card 2: Agent Integration */}
            <div className="bg-parchment/5 border border-slate/20 rounded-lg p-4 mb-4">
              <h3 className="text-ember font-semibold mb-2 flex items-center gap-2">
                <span>⚡</span> 本地 Agent 打通
              </h3>
              <div className="text-sm text-parchment/70 space-y-2">
                <p>已安装 skill：<code className="bg-ink px-1 rounded text-xs">study</code>、<code className="bg-ink px-1 rounded text-xs">fable</code></p>
                <p className="text-xs text-parchment/50">使用步骤：</p>
                <ol className="list-decimal list-inside text-xs text-parchment/60 space-y-1 pl-1">
                  <li>把项目 <code className="bg-ink px-1 rounded">.claude/skills/</code> 下的 <code className="bg-ink px-1 rounded">study/</code> 和 <code className="bg-ink px-1 rounded">fable/</code> 复制到你的 Claude Code skills 目录</li>
                  <li>在 agent 聊天里用 <code className="bg-ink px-1 rounded">/study</code> 或 <code className="bg-ink px-1 rounded">/fable</code> 触发</li>
                </ol>
                <div className="bg-ink/40 border-l-2 border-green-600/50 pl-3 py-2 text-xs text-parchment/50">
                  🔑 skill 会自动读取应用配置的学习库路径<br />
                  你不需要手动修改 skill 里的路径。skill 运行时会自动从项目 <code className="bg-ink px-1 rounded">.env</code> 中读取 <code className="bg-ink px-1 rounded">STUDY_LIBRARY_PATH</code> 的值作为报告保存目录。若读取失败，skill 会提示你手动配置。
                </div>
              </div>
            </div>

            {/* Card 3: Custom Paintings */}
            <div className="bg-parchment/5 border border-slate/20 rounded-lg p-4">
              <h3 className="text-ember font-semibold mb-2 flex items-center gap-2">
                <span>🖼️</span> 自选配图
              </h3>
              <div className="text-sm text-parchment/70 space-y-2">
                <p>支持手动增删配图，当前共 {info?.paintingCount ?? 0} 张。</p>

                <p className="text-xs text-parchment/50 mt-3">添加步骤：</p>
                <ol className="list-decimal list-inside text-xs text-parchment/60 space-y-1 pl-1">
                  <li>把图片文件（.jpg / .png）放入项目根目录的 <code className="bg-ink px-1 rounded">Pictures/</code> 文件夹</li>
                  <li>编辑 <code className="bg-ink px-1 rounded">Pictures/index.json</code>，在数组末尾追加一个 JSON 对象</li>
                  <li>保存文件，重启应用生效</li>
                </ol>

                <div className="bg-ink/40 rounded-md p-3 mt-2 font-mono text-[11px] text-parchment/50 leading-relaxed">
{`{
  "id": "custom-1",
  "painter": "你的名字",
  "title": "作品名",
  "file": "文件名.jpg",
  "category": "custom",
  "year": 2026
}`}
                </div>

                <table className="w-full text-[11px] mt-2 border-collapse">
                  <thead>
                    <tr className="text-ember border-b border-slate/20">
                      <th className="text-left py-1">字段</th>
                      <th className="text-left py-1">必填</th>
                      <th className="text-left py-1">说明</th>
                    </tr>
                  </thead>
                  <tbody className="text-parchment/50">
                    <tr className="border-b border-slate/10">
                      <td className="py-1"><code className="bg-ink px-1 rounded">id</code></td>
                      <td className="text-ember">✓</td>
                      <td>唯一标识，任意字符串</td>
                    </tr>
                    <tr className="border-b border-slate/10">
                      <td className="py-1"><code className="bg-ink px-1 rounded">file</code></td>
                      <td className="text-ember">✓</td>
                      <td>图片文件名，必须和 Pictures/ 下的实际文件一致</td>
                    </tr>
                    <tr className="border-b border-slate/10">
                      <td className="py-1"><code className="bg-ink px-1 rounded">title</code></td>
                      <td className="text-ember">✓</td>
                      <td>作品名，在应用中显示</td>
                    </tr>
                    <tr className="border-b border-slate/10">
                      <td className="py-1"><code className="bg-ink px-1 rounded">painter</code></td>
                      <td className="text-parchment/30">—</td>
                      <td>作者名，显示在画面左下角。可写任意值</td>
                    </tr>
                    <tr className="border-b border-slate/10">
                      <td className="py-1"><code className="bg-ink px-1 rounded">category</code></td>
                      <td className="text-parchment/30">—</td>
                      <td>分类标签，仅用于筛选。可写 custom 或其他任意值</td>
                    </tr>
                    <tr>
                      <td className="py-1"><code className="bg-ink px-1 rounded">year</code></td>
                      <td className="text-parchment/30">—</td>
                      <td>年份，填 null 或任意数字均可</td>
                    </tr>
                  </tbody>
                </table>

                <p className="text-[11px] text-parchment/40 italic mt-2">
                  删除配图：从 Pictures/ 移除图片文件，同时从 index.json 删除对应条目，重启生效。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
