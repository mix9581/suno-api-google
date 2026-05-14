# Suno 链接识别功能开发文档

## 目标

在独立项目中实现一个 Suno 分享链接识别功能：用户粘贴 `suno.com` 分享链接后，系统只解析并展示歌曲信息，包括歌曲名、歌词、歌曲音乐风格、排除音乐风格，以及可选的原曲信息。

当前插件没有独立的“只识别链接信息”UI；插件里的“解析并翻唱”是另一个功能，走 `GET /api/cover_link?url=...`。后端已有可复用的纯识别接口：`GET /api/resolve_link?url=...`。

## 后端接口

这个功能不创建翻唱任务，不上传音频，不调用插件的翻唱流程，也不需要用户 Suno Cookie。后端通过 Suno 公开 clip 接口读取歌曲信息。

如果部署方配置了 `SUNO_LINK_RESOLVE_KEY`，请求需要带任意一种验证方式：

- Header：`X-Resolve-Key: <key>`
- Header：`X-API-Key: <key>`
- Query：`?key=<key>`

```http
GET /api/resolve_link?url=https%3A%2F%2Fsuno.com%2Fsong%2F...
X-Resolve-Key: optional-resolve-key
```

主要返回字段：

```json
{
  "clip_id": "clip uuid",
  "title": "歌曲名",
  "link": "https://suno.com/song/clip uuid",
  "lyrics": "歌词",
  "tags": "歌曲音乐风格",
  "negative_tags": "排除音乐风格",
  "is_cover": true,
  "cover_clip_id": "原曲 clip uuid",
  "cover_link": "https://suno.com/song/原曲 clip uuid",
  "song": {
    "clip_id": "clip uuid",
    "title": "歌曲名",
    "link": "https://suno.com/song/clip uuid",
    "lyrics": "歌词",
    "tags": "歌曲音乐风格",
    "negative_tags": "排除音乐风格"
  },
  "original_song": {
    "clip_id": "原曲 clip uuid",
    "title": "原曲歌曲名",
    "link": "https://suno.com/song/原曲 clip uuid",
    "lyrics": "原曲歌词",
    "tags": "原曲音乐风格",
    "negative_tags": "原曲排除音乐风格"
  },
  "text": "可直接展示或复制的中文摘要文本"
}
```

## 风格拆分规则

- 先读取接口返回的 `tags` 作为歌曲音乐风格来源。
- 如果 `negative_tags` 已存在，优先使用它作为排除音乐风格。
- 如果 `negative_tags` 不存在，从 `tags` 中提取以 `-` 或 `－` 开头的条目作为排除音乐风格。
- 没有带 `-` 的条目时，`tags` 全部作为歌曲音乐风格。

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
   - `link = data.link || data.links?.song || https://suno.com/song/${clipId}`
   - `styleTags / negativeTags` 使用上面的拆分规则。
   - 如果 `data.is_cover` 或 `data.cover_clip_id` 存在，读取 `data.original_song`。
   - `text = data.text` 可直接用于展示或复制。
5. UI 展示识别结果；如果是 cover，同时展示原曲信息和原曲链接。

## 与翻唱流程的边界

Suno 链接识别和翻唱创建是两个独立功能：

- 链接识别：只读取公开歌曲信息，输出歌曲名、歌词、风格、排除风格、歌曲链接、可选原曲信息。
- 翻唱创建：需要用户 API Key 已绑定可用 Suno Cookie，并使用上传音频或已有 clip id 调用翻唱接口。
- 插件里的“解析并翻唱”入口使用 `GET /api/cover_link?url=...`，这个接口需要 `X-API-Key` 和当前浏览器/数据库绑定的 Suno Cookie，用于验证当前账号是否能读取并翻唱该歌曲。
- 不要把 `resolve_link` 的返回结果直接当作插件翻唱任务的输入；`resolve_link` 只给独立链接识别项目使用。

## 错误处理

- 链接不是 Suno 链接：前端直接提示。
- `clip_id` 不存在：提示“未识别到歌曲 ID”。
- 解析 Key 错误：提示“解析 Key 无效”。
- Suno 接口返回 404/403：提示链接不可访问或账号无权限。
- 网络超时：允许重试。

## 安全注意

- 不要在前端持久化完整 Suno Cookie。
- 这个解析功能不需要浏览器插件传 Cookie。
- 如果需要限制访问，使用独立的 `SUNO_LINK_RESOLVE_KEY`，不要复用用户账号 Cookie。
