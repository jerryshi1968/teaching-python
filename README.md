# Python 编程教学工具

本仓库处于本地开发阶段。当前实现不连接生产服务，也不执行学生 Python 代码。

## 本地质量检查

```powershell
npm ci
npm test
npm run check
npm run build
git diff --check
git status --short
```

## 第 5 阶段：发布前准备

发布前在本地执行：

```powershell
npm run preflight
npm run package:release
```

`preflight` 只检查仓库边界、运行时约束和必需文件，不连接生产服务器。 `package:release` 在 `release/` 下生成带 SHA-256 的发布清单；该目录不纳入版本控制。实际部署、健康检查和回滚顺序见 `docs/release-runbook.md`。
