import { GoogleGenAI } from "@google/genai";
import Replicate from "replicate";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// ── CONFIG ──────────────────────────────────────────────────────────────────
const OUTPUT_DIR = "./public/assets/generated";

const IMAGE_PROMPTS = [
  {
    name: "hero",
    prompt:
      "Dark cinematic photo of a professional car mechanic working under a lifted car in a modern garage, dramatic rim lighting, deep shadows, moody atmosphere, photorealistic, 16:9",
  },
  {
    name: "workshop",
    prompt:
      "Wide shot of a clean premium auto repair workshop interior, rows of tools, bright overhead lights, one car on a hydraulic lift, no people, architectural photography, dark steel tones",
  },
  {
    name: "engine",
    prompt:
      "Extreme close-up macro photo of a clean car engine block, chrome and steel parts, dramatic side lighting, shallow depth of field, dark background, commercial automotive photography",
  },
  {
    name: "exterior",
    prompt:
      "Night exterior of a modern auto repair shop building, illuminated signage, wet pavement reflections, cinematic wide angle, premium brand feel",
  },
  {
    name: "mechanic_portrait",
    prompt:
      "Portrait of a confident Finnish male mechanic in clean dark work uniform, arms crossed, blurred workshop background, professional studio lighting, commercial photography",
  },
];

const VIDEO_PROMPT = {
  name: "hero_loop",
  prompt:
    "Photorealistic cinematic slow-motion video: a black sports car sitting in a dark professional garage physically disassembles — the doors, hood, engine block, wheels, and body panels physically detach and float outward with weight and momentum, each metal part crisp and sharp-edged, hard physical separation with no morphing or cross-fading, studio rim lighting highlighting every chrome and steel surface, dark moody background, commercial automotive photography, 4K quality",
  duration: 10,
};
// ────────────────────────────────────────────────────────────────────────────

async function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Created output dir: ${OUTPUT_DIR}`);
  }
}

async function generateImages() {
  console.log("\n🖼️  Starting image generation with Imagen 4...\n");

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });

  for (const item of IMAGE_PROMPTS) {
    try {
      console.log(`  Generating: ${item.name}...`);

      const response = await ai.models.generateImages({
        model: "imagen-4.0-generate-001",
        prompt: item.prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: item.name === "mechanic_portrait" ? "9:16" : "16:9",
        },
      });

      const imageData = response.generatedImages?.[0]?.image?.imageBytes;
      if (!imageData) throw new Error("No image data returned");

      const buffer = Buffer.from(imageData, "base64");
      const filePath = path.join(OUTPUT_DIR, `${item.name}.png`);
      fs.writeFileSync(filePath, buffer);

      console.log(`  ✅ Saved: ${filePath}`);
    } catch (err) {
      console.error(`  ❌ Failed: ${item.name}:`, err);
    }
  }
}

async function generateVideo() {
  console.log("\n🎬  Starting video generation with Kling via Replicate...\n");

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });

  try {
    console.log(`  Generating: ${VIDEO_PROMPT.name}... (this takes 2-3 mins)`);

    const output = await replicate.run(
      "kwaivgi/kling-v3-omni-video",
      {
        input: {
          prompt: VIDEO_PROMPT.prompt,
          duration: VIDEO_PROMPT.duration,
          aspect_ratio: "16:9",
          mode: "pro",
          generate_audio: false,
          video_reference_type: "feature",
        },
      }
    ) as any;

    const videoUrl = typeof output?.url === 'function' ? output.url() : (Array.isArray(output) ? output[0] : String(output));
    if (!videoUrl || !String(videoUrl).startsWith('http')) throw new Error(`Invalid URL: ${videoUrl}`);

    console.log(`  Downloading from: ${videoUrl}`);
    const response = await fetch(String(videoUrl));
    const buffer = Buffer.from(await response.arrayBuffer());
    const filePath = path.join(OUTPUT_DIR, `${VIDEO_PROMPT.name}.mp4`);
    fs.writeFileSync(filePath, buffer);
    console.log(`  ✅ Saved: ${filePath}`);

    // Auto-extract frames for scroll scrubbing
    console.log(`  Extracting frames...`);
    const framesDir = path.join(OUTPUT_DIR, "frames");
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
    const { execSync } = await import("child_process");
    execSync(
      `ffmpeg -i ${filePath} -vf "fps=6" -vcodec libwebp -compression_level 4 -q:v 90 ${framesDir}/frame_%04d.webp -y`,
      { stdio: "inherit" }
    );
    console.log(`  ✅ Frames saved to: ${framesDir}`);
  } catch (err) {
    console.error(`  ❌ Video failed:`, err);
  }
}

async function main() {
  console.log("🚗  Kosrjaamo Asset Generator");
  console.log("================================");

  await ensureOutputDir();

  const videoOnly = process.argv.includes("--video-only");
  if (!videoOnly) await generateImages();
  await generateVideo();

  console.log("\n✅  All done! Assets saved to:", OUTPUT_DIR);
}

main().catch(console.error);