# 插件问题诊断

## 问题描述
点击「翻唱」按钮后，Scene3（翻唱配置界面）没有显示，插件界面空白。

## 诊断步骤

### 1. 打开插件的 DevTools Console

1. 打开插件 side panel（右侧面板）
2. 在插件内**右键点击空白处** → 选择「检查」（Inspect）
3. 打开 **Console** 标签

### 2. 在 Console 中运行以下命令

```javascript
// 检查当前 scene
console.log('当前 scene:', state.scene);

// 检查 scene3 元素是否存在
const scene3 = document.getElementById('scene3');
console.log('scene3 元素:', scene3);
console.log('scene3 是否存在:', !!scene3);

// 检查 scene3 的 class
if (scene3) {
  console.log('scene3 classes:', scene3.className);
  console.log('scene3 display:', window.getComputedStyle(scene3).display);
  console.log('scene3 innerHTML 长度:', scene3.innerHTML.length);
}

// 检查所有 scene
document.querySelectorAll('.scene').forEach(s => {
  console.log(`${s.id}: active=${s.classList.contains('active')}, display=${window.getComputedStyle(s).display}`);
});

// 尝试手动切换到 scene3
showScene('scene3');
console.log('已尝试切换到 scene3');
```

### 3. 检查是否有 JavaScript 错误

在 Console 中查看是否有**红色的错误信息**。

### 4. 手动测试 enterScene3 函数

```javascript
// 手动调用 enterScene3
enterScene3('test-clip-id', 'test.mp3');
console.log('已调用 enterScene3');
```

### 5. 检查插件版本

在 `chrome://extensions/` 页面：
1. 找到「青幻工具箱」
2. 查看「版本」号
3. 最新版本应该包含 commit `e29b9ab`

### 6. 强制重新加载插件

1. 在 `chrome://extensions/` 页面
2. 找到「青幻工具箱」
3. 点击**刷新图标**（🔄）
4. 关闭并重新打开插件

## 可能的原因

1. **插件没有更新到最新版本** - 需要重新从 GitHub 下载 ZIP 并安装
2. **CSS 文件缓存问题** - 需要强制刷新
3. **JavaScript 报错** - 检查 Console 错误
4. **DOM 元素未正确加载** - popup.html 可能有问题

## 临时解决方案

如果上述诊断无法解决，可以尝试：

1. **完全卸载插件**
2. **从 GitHub 下载最新 ZIP**: https://github.com/mix9581/suno-api-google
3. **解压后重新安装**
4. **清除 Chrome 缓存**：`chrome://settings/clearBrowserData`（选择「缓存的图片和文件」）

## 需要提供的信息

请将以下信息截图或复制发给开发者：

1. Console 中运行上述命令的**完整输出**
2. Console 中的**所有错误信息**（红色的）
3. 插件的**版本号**
4. 是否重新安装过插件
