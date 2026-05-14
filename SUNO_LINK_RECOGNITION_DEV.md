# Suno 链接识别功能开发文档

## 目标

在独立项目中实现一个 Suno 分享链接识别功能：用户粘贴 `suno.com` 分享链接后，系统解析并展示歌曲名、歌词、歌曲音乐风格、排除音乐风格。

当前插件已暂时移除此 UI，但后端已有可复用接口：`GET /api/resolve_link?url=...`。

## 后端接口

请求：

```http
GET /api/resolve_link?url=https%3A%2F%2Fsuno.com%2Fsong%2F...
X-API-Key: sk-...
X-Cookie-Scope: browser
X-Suno-Cookie: ...
```

返回字段以现有后端为准，主要使用：

```json
{
  "clip_id": "clip uuid",
  "title": "歌曲名",
  "lyrics": "歌词",
  "tags": "歌曲音乐风格",
  "negative_tags": "排除音乐风格",
  "model_name": "模型",
  "duration": 123,
  "status": "complete",
  "audio_url": "https://...",
  "video_url": "https://..."
}
```

## 前端数据模型

建议在新项目里归一化成：

```ts
type SunoLinkRecognition = {
  clipId: string;
  title: string;
  lyrics: string;
  styleTags: string;
  negativeTags: string;
  modelName?: string;
  durationSeconds?: number;
  status?: string;
  audioUrl?: string;
  videoUrl?: string;
};
```

## 风格拆分规则

需求规则：

- 先读取接口返回的 `tags` 作为歌曲音乐风格来源。
- 如果 `negative_tags` 已存在，优先使用它作为排除音乐风格。
- 如果 `negative_tags` 不存在，从 `tags` 中提取以 `-` 或 `－` 开头的条目作为排除音乐风格。
- 没有带 `-` 的条目时，`tags` 全部作为歌曲音乐风格。

参考实现：

```ts
function splitStyleTags(input: { tags?: string | null; negative_tags?: string | null }) {
  const tags = String(input.tags || '').trim();
  const explicitNegative = String(input.negative_tags || '').trim();
  const parts = tags
    .split(/[,，\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

  const positive: string[] = [];
  const negative: string[] = [];

  for (const part of parts) {
    if (/^[-－]\s*/.test(part)) {
      negative.push(part.replace(/^[-－]\s*/, '').trim());
    } else {
      positive.push(part);
    }
  }

  return {
    styleTags: positive.length ? positive.join(', ') : tags,
    negativeTags: explicitNegative || negative.join(', '),
  };
}
```

## 识别流程

1. 用户输入 Suno 分享链接。
2. 前端校验链接包含 `suno.com`。
3. 请求 `GET /api/resolve_link?url=...`。
4. 归一化返回字段：
   - `title = data.title || '未知歌曲'`
   - `lyrics = data.lyrics || data.lyric || data.prompt || ''`
   - `clipId = data.clip_id`
   - `styleTags / negativeTags` 使用上面的拆分规则。
5. UI 展示识别结果。

## UI 建议

建议把识别功能做成独立工具，不要和翻唱创建流程强耦合：

- 输入区：Suno 分享链接输入框 + 识别按钮。
- 加载态：按钮显示“识别中...”，禁用重复点击。
- 结果区：四个固定字段。
  - 歌曲名
  - 歌词
  - 歌曲音乐风格
  - 排除音乐风格
- 错误态：显示接口错误，不清空用户输入。

## 错误处理

常见错误：

- 链接不是 Suno 链接：前端直接提示。
- `clip_id` 不存在：提示“未识别到歌曲 ID”。
- Cookie 失效：提示重新绑定 Suno Cookie。
- Suno 接口返回 404/403：提示链接不可访问或账号无权限。
- 网络超时：允许重试。

## 与翻唱流程的边界

当前插件里的翻唱流程要求保持空白填写页：

- 上传音频成功后进入翻唱填写页。
- Suno 分享链接解析成功后进入同样的空白翻唱填写页。
- 不自动填入歌词、风格、排除风格。

识别功能在新项目里可以独立开发，不要依赖插件的 `scene3`、`styleCards`、`submitCoverBtn` 等内部状态。

## 安全注意

- 不要在前端持久化完整 Suno Cookie。
- 如果必须从浏览器插件传 Cookie，只通过请求头短暂传给后端。
- 后端不要在日志中打印完整 Cookie、JWT、音频下载地址中的敏感签名参数。
- API Key、Cookie、2captcha key 都应从服务端环境变量或受控存储读取。

## 可复用接口清单

当前项目相关接口：

- `GET /api/resolve_link?url=...`：解析 Suno 分享链接。
- `GET /api/clip?id=...`：按 clip id 获取更详细的 clip 信息。
- `GET /api/auth/status`：检查 API Key 与 Cookie 状态。

如果新项目不需要翻唱，只集成 `resolve_link` 即可。
