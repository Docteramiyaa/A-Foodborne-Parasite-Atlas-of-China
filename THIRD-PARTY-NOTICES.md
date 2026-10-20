# 第三方资产与许可 / Third-Party Notices

本项目仅对自身原创代码与整理内容授予许可；以下第三方资产遵循其原许可。

## 字体

- **Noto Serif SC / Noto Sans SC**（通过 `@fontsource-variable/*` 引入）
- 许可：SIL Open Font License 1.1（<https://scripts.sil.org/OFL>）
- 版权：Google Inc. / The Noto Project Authors
- 部署时字体文件会随构建产物分发，请保留本声明与 OFL 许可文本。

## 地图边界数据

- 来源：阿里云 DataV.GeoAtlas 省级边界数据（`data/geography/china-provinces.geo.json`）
- 用途：仅用于本项目的地理可视化示意。
- 说明：该数据由第三方公开服务提供，本项目未对其主张授权；使用与再分发前请核对数据提供方的使用条款。
- 地图仅作知识展示示意，**不作为标准地图使用**；在中国境内公开上线地图服务，请按《地图管理条例》要求使用标准地图或取得审图号。

## 运行时依赖（主要）

- React / React DOM — MIT
- React Router — MIT
- Express — MIT
- ECharts — Apache-2.0（分发构建产物时请保留其 LICENSE/NOTICE）
- Tailwind CSS — MIT
- framer-motion — MIT
- lucide-react — ISC
- Zod — MIT

完整依赖清单以 `package-lock.json` 为准。

## 引用文献

`data/sources.json` 收录 66 份来源的题录信息与使用说明。本项目**不重新分发**这些文献/指南/机构页面的原文；权利归原作者与出版方所有，正文中的链接指向原始出处。
