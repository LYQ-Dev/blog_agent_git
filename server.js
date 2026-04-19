const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const { execSync } = require('child_process');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ——————————————————————————————————————
// 配置项   在这配置智能体信息
// ——————————————————————————————————————
const API_KEY = " ";
const API_URL = " ";
const MODEL = " ";

const ROOT_PATH = {
  math: " ",
  english: " ",
  major: " "
};

const DIARY_ROOT_PATH = " ";

// Git 配置  修改成自己的
const GIT_REPO_PATH = "  ";
const GIT_REMOTE = "origin";
const GIT_BRANCH = "main";

const PROMPTS = {
  math: `你是考研数学日记生成助手，请根据用户简短内容，自动扩写为完整、规范、结构完整的学习记录，严格按以下格式输出，只返回 Markdown。
---
title: 考研数学学习记录{date}
published: {date}
pinned: false
description: 考研数学学习与复盘记录
tags: [考研数学,学习记录]（请根据用户输入的当日难点填写，不能填写纯数字！）
category: math
licenseName: "Unlicensed"
author: 程翊雪
draft: false
date: {date}
---
# 考研数学学习记录 | {date}
## 今日学习内容
{user_input}
## 薄弱点
（AI 自动扩写，基于用户输入）
## AI知识点带复盘
（根据用户上述提到的所有知识点进行一个基于考研常考的扩写、复盘）
## 今日小结
（AI 自动扩写，基于事实，宁少勿滥）
💡 碎碎念：稳步积累，持续提升。
> 文档内容由 AI 辅助生成`,

  english: `你是考研英语日记生成助手，请根据用户输入，扩写为规范完整的英语学习日记，严格按以下格式输出，只返回 Markdown。
---
title: 考研英语学习记录{date}
published: {date}
pinned: false
description: 考研英语单词与长难句学习记录
tags: [考研英语,学习记录]
category: english
licenseName: "Unlicensed"
author: 程翊雪
draft: false
date: {date}
---
# 考研英语学习记录 | {date}
## 今日学习内容
{user_input}
## 单词复盘
（AI 自动整理）
💡 碎碎念：坚持积累，英语必上岸！
> 文档内容由 AI 辅助生成`,

  major: `你是考研408专业课助手，请根据用户输入，扩写为完整规范的专业课学习记录，严格按以下格式输出，只返回 Markdown。
---
title: 考研专业课学习记录{date}
published: {date}
pinned: false
description: 408 专业课学习与复盘
tags: [考研专业课,学习记录]（请根据用户输入的当日难点填写，不能填写纯数字！）
category: major
licenseName: "Unlicensed"
author: 程翊雪
draft: false
date: {date}
---
# 考研专业课学习记录 | {date}
## 今日学习内容
{user_input}
## AI知识点带复盘
（根据用户上述提到的所有知识点进行考研考点扩写、复盘）
## 问题与反思
（基于用户输入，不编造）
## 收获与总结
（基于用户输入，不编造）
💡 碎碎念：踏实吃透每一个知识点！
> 文档内容由 AI 辅助生成`,

  diary: `你是学习日记生成助手，请根据用户输入，扩写为完整日记，严格按以下格式输出，只返回 Markdown。
---
title: 学习时长统计
date: {date}
mood: 🤩
weather: 雨天
location: 图书馆
tags: [考研, 项目, 学习]
images: []
---
## 今日学习时长统计
###
{user_input}
---
明天继续加油！💪`
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 20,
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('仅支持图片文件上传'));
  }
});

function getMonthDayFormat(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}-${day}`;
}

function getIsoDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseTags(tagsInput) {
  if (!tagsInput || typeof tagsInput !== 'string') {
    return ['考研', '项目', '学习'];
  }

  const tags = tagsInput
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (tags.length === 0) {
    return ['考研', '项目', '学习'];
  }

  return tags;
}

function getImageExtension(file) {
  const extFromName = path.extname(file.originalname || '').toLowerCase();
  const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
  if (allowedExt.has(extFromName)) {
    return extFromName;
  }

  if (file.mimetype === 'image/png') return '.png';
  if (file.mimetype === 'image/webp') return '.webp';
  if (file.mimetype === 'image/gif') return '.gif';
  return '.jpg';
}

function normalizeSingleLineText(input, fallback) {
  if (typeof input !== 'string') {
    return fallback;
  }

  const normalized = input.replace(/[\r\n]+/g, ' ').trim();
  if (!normalized) {
    return fallback;
  }

  return normalized;
}

function buildDiaryMarkdown({
  date,
  title,
  mood,
  weather,
  location,
  tags,
  images,
  content
}) {
  const tagText = tags.join(', ');
  const imageText = images.length > 0 ? images.join(', ') : '';

  return [
    '---',
    `title: ${title}`,
    `date: ${date}`,
    `mood: ${mood}`,
    `weather: ${weather}`,
    `location: ${location}`,
    `tags: [${tagText}]`,
    `images: [${imageText}]`,
    '---',
    '',
    `## ${title}`,
    '',
    `### ${content}`,
    '',
    '---',
    '',
    '明天继续加油！💪',
    ''
  ].join('\n');
}

function writeMDFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

async function generateContentByAI(prompt) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI接口请求失败 [${response.status}]`);
  }

  const result = await response.json();
  let mdContent = "";
  for (const item of result.output) {
    if (item.type === "message" && item.role === "assistant") {
      mdContent = item.content[0].text;
      break;
    }
  }
  return mdContent;
}

app.post('/api/generate', async (req, res) => {
  try {
    const { type, userInput } = req.body;
    if (!type || !userInput) {
      return res.status(400).json({ success: false, message: "参数不能为空" });
    }

    const today = new Date();
    const isoDate = getIsoDateLocal(today);
    const monthDay = getMonthDayFormat(today);

    const prompt = PROMPTS[type]
      .replace(/{date}/g, isoDate)
      .replace(/{user_input}/g, userInput.trim());

    const mdContent = await generateContentByAI(prompt);

    let filePath = "";
    let fileName = "";
    if (type === "math" || type === "english" || type === "major") {
      filePath = path.join(ROOT_PATH[type], monthDay, "index.md");
      fileName = `${type}_学习记录_${isoDate}.md`;
    } else if (type === "diary") {
      filePath = path.join(DIARY_ROOT_PATH, isoDate, "index.md");
      fileName = `学习日记_${isoDate}.md`;
    } else {
      return res.status(400).json({ success: false, message: "不支持的类型" });
    }

    writeMDFile(filePath, mdContent);
    res.json({
      success: true,
      message: "生成成功",
      data: { filePath, content: mdContent, fileName }
    });

  } catch (error) {
    console.error("错误：", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/generate-diary', upload.array('images', 20), async (req, res) => {
  try {
    const {
      userInput,
      title,
      mood,
      weather,
      location,
      tags
    } = req.body;

    if (!userInput || !userInput.trim()) {
      return res.status(400).json({ success: false, message: '日记内容不能为空' });
    }

    const today = new Date();
    const isoDate = getIsoDateLocal(today);
    const diaryDir = path.join(DIARY_ROOT_PATH, isoDate);

    if (!fs.existsSync(diaryDir)) {
      fs.mkdirSync(diaryDir, { recursive: true });
    }

    const files = Array.isArray(req.files) ? req.files : [];
    const imageRefs = [];
    files.forEach((file, index) => {
      const ext = getImageExtension(file);
      const imageName = `${index + 1}${ext}`;
      const imagePath = path.join(diaryDir, imageName);
      fs.writeFileSync(imagePath, file.buffer);
      imageRefs.push(`./${imageName}`);
    });

    const finalTitle = normalizeSingleLineText(title, '学习时长统计');
    const finalMood = normalizeSingleLineText(mood, '🤩');
    const finalWeather = normalizeSingleLineText(weather, '晴天');
    const finalLocation = normalizeSingleLineText(location, '图书馆');
    const finalTags = parseTags(tags);
    const finalContent = normalizeSingleLineText(userInput, '今天按计划完成学习任务。');

    const mdContent = buildDiaryMarkdown({
      date: isoDate,
      title: finalTitle,
      mood: finalMood,
      weather: finalWeather,
      location: finalLocation,
      tags: finalTags,
      images: imageRefs,
      content: finalContent
    });

    const filePath = path.join(diaryDir, 'index.md');
    writeMDFile(filePath, mdContent);

    res.json({
      success: true,
      message: '日记生成成功',
      data: {
        filePath,
        content: mdContent,
        imageCount: imageRefs.length,
        folder: diaryDir,
        fileName: `学习日记_${isoDate}.md`
      }
    });
  } catch (error) {
    console.error('日记生成错误：', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ——————————————————————————————————————
// Git 提交推送（支持自定义 commit 信息）
// ——————————————————————————————————————
app.post('/api/git-push', (req, res) => {
  try {
    const { commitMsg } = req.body;
    if (!commitMsg) {
      return res.json({ success: false, message: "提交信息不能为空" });
    }

    execSync(`git -C "${GIT_REPO_PATH}" add .`, { stdio: 'ignore' });
    execSync(`git -C "${GIT_REPO_PATH}" commit -m "${commitMsg}"`, { stdio: 'ignore' });
    execSync(`git -C "${GIT_REPO_PATH}" push ${GIT_REMOTE} ${GIT_BRANCH}`, { stdio: 'ignore' });

    res.json({ success: true, message: "推送成功" });

  } catch (err) {
    res.json({ success: false, message: "Git 操作失败（无更改/权限/网络问题）" });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`✅ 服务已启动：http://localhost:${PORT}`);
}); 