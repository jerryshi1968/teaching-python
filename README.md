# Python 编程教学工具

本仓库处于本地开发阶段。当前实现不连接生产服务，也不执行学生 Python 代码。

项目代码使用 v2 多文件快照：数据库中的 `python_documents` 只保存当前 `revision_id` 和版本号，`python_revisions` 保存修订元数据，共享 `files` 表保存当前文件树索引，文件正文由 `PYTHON_STORAGE_ROOT` 指向的 SourceStore 保存。未设置时，本地默认使用仓库下的 `storage/<APP_MODE>`。

`004_python_multifile.sql` 会清空所有 `project_type = 'python'` 的测试项目后建立新结构；不会删除其他教学工具的项目。

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
