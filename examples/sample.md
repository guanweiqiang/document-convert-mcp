# 示例文档

## 简介

这是用于测试 **document-converter-mcp** 服务器的 Markdown 文档。

## 功能

以下是支持的转换功能列表：

- Markdown 转 PDF
- Markdown 转 DOCX
- DOCX 转 Markdown 提取
- PDF 转 Markdown 提取
- Markdown 转 HTML
- 批量目录转换

## 代码示例

```ts
console.log("hello mcp");
```

## 表格示例

| 功能         | 格式  | 引擎       |
|--------------|-------|------------|
| Markdown 转 PDF | PDF  | Pandoc     |
| DOCX 转 Markdown | MD  | Pandoc/MII |
| PDF 转 Markdown | MD   | MarkItDown |
| Markdown 转 HTML | HTML | Pandoc     |

> 这是一个引用块。它演示了引用块在转换过程中如何保留。
>
> — document-converter-mcp 团队

## 中文段落

本文档包含中文字符，用于测试中文 PDF 转换。

中文需要使用 `pdfEngine: "xelatex"` 和 `cjkMainFont` 参数才能正确渲染。

常用 CJK 字体：
- Windows: `Microsoft YaHei`、`SimSun`
- macOS: `Songti SC`、`Heiti SC`
- Linux: `Noto Sans CJK SC`

---

示例文档结束。
