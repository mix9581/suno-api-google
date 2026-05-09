// Cookie 分析结果

关键 Cookie 发现：

1. __session (基础 session)
   - 存在：✓
   - JWT Token，包含用户信息
   - exp: 1778316113 (2026-05-09 15:35:13)
   - 当前时间约为 2026-05-09 15:35:56
   - 状态：**即将过期**（剩余不到 1 分钟！）

2. __session_Jnxw-muT (后缀 session)
   - 存在：✓
   - 与 __session 内容相同
   - exp: 1778316113
   - 状态：**即将过期**

3. __session_U9tcbTPE (另一个后缀 session)
   - 存在：✓
   - exp: 1764999814 (2026-03-24)
   - 状态：**已过期**（过期很久了）

4. __client (基础 client token)
   - 存在：✓
   - Refresh token
   - exp: 1809848149 (2027-06-05)
   - 状态：**有效**（还有 1 年多）

5. __client_Jnxw-muT (后缀 client token)
   - 存在：✓
   - 与 __client 内容相同
   - exp: 1809848149
   - 状态：**有效**

6. __refresh_U9tcbTPE (refresh token)
   - 存在：✓
   - 用于刷新 session

## 问题诊断

### 核心问题：Session Token 即将过期

你的 `__session` 和 `__session_Jnxw-muT` token 在测试时**只剩不到 1 分钟**就过期了！

这就是为什么你遇到 401 错误的原因：
- 当你点击「刷新 Cookie」时，插件捕获了这个 Cookie
- 但是 session token 已经过期或即将过期
- 服务器验证时返回 401

### 好消息

你有 **长期有效的 refresh token**：
- `__client` 和 `__client_Jnxw-muT` 有效期到 2027 年
- `__refresh_U9tcbTPE` 可以用来刷新 session

## 解决方案

### 方案 1：使用 Refresh Token 自动刷新 Session（推荐）

插件应该：
1. 检测到 session 即将过期时
2. 使用 `__client` token 调用 Clerk API 刷新 session
3. 获取新的 `__session` token

### 方案 2：触发 Suno 页面刷新 Session

在 suno.com 页面：
1. 点击任意功能（Create、Library 等）
2. 这会触发 API 请求
3. Suno 会自动用 refresh token 刷新 session
4. 然后插件捕获新的 Cookie

### 方案 3：手动刷新（临时）

在 suno.com Console 运行：

```javascript
// 触发 session 刷新
fetch('https://studio-api.prod.suno.com/api/billing/info/', {
  credentials: 'include'
}).then(r => r.json()).then(console.log);
```

然后在插件中点击「刷新 Cookie」。

## 下一步优化

我需要优化插件，添加：
1. **Session 过期检测**：解析 JWT 的 exp 字段
2. **自动刷新机制**：使用 refresh token 刷新 session
3. **更好的错误提示**：告诉用户 session 过期，需要刷新

你现在可以先试试方案 2 或 3，然后我会优化插件代码。
