import fs from "fs";
import path from "path";
import { exec } from "child_process";
import Tesseract from "tesseract.js";

/**
 * Convert a multi-page PDF to text using Tesseract.js (OCR).
 * 
 * @param {string} pdfPath - Path to the PDF file
 * @param {string} [outputDir="./images"] - Directory to store generated page images
 * @param {string} [language="heb"] - Tesseract language (e.g. "eng", "heb", etc.)
 * @returns {Promise<string>} - Combined OCR text from all PDF pages
 */
export async function pdfToText(pdfPath, outputDir = "./images", language = "heb") {
  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Convert all PDF pages into images (page-0.png, page-1.png, etc.)
  // -density 300 => 300 DPI for higher quality
  // "%d" => page number appended automatically
  const cmd = `magick -density 150 "${pdfPath}" "${path.join(outputDir, "page-%d.png")}"`;
  console.log("Running command:", cmd);

  // Wait for the PDF-to-image conversion to finish
  await new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error("Error converting PDF:", err);
        return reject(err);
      }
      console.log("PDF converted to images:", stdout || stderr);
      resolve();
    });
  });

  // 2. Read all "page-*.png" files in outputDir
  const files = fs.readdirSync(outputDir).filter((file) => {
    return file.startsWith("page-") && file.endsWith(".png");
  });

  // Sort them by page number (so page-0.png, page-1.png, etc.)
  files.sort((a, b) => {
    const pageA = parseInt(a.match(/page-(\d+)\.png/)[1], 10);
    const pageB = parseInt(b.match(/page-(\d+)\.png/)[1], 10);
    return pageA - pageB;
  });

  // 3. OCR each page in order and accumulate text
  let fullText = "";
  for (const file of files) {
    const imagePath = path.join(outputDir, file);
    console.log("Running Tesseract on:", imagePath);
    // Recognize text in the specified language
    const {
      data: { text },
    } = await Tesseract.recognize(imagePath, language);

    fullText += text.trim() + "\n\n";
  }

  const pageFiles = fs.readdirSync(outputDir)
    .filter(file => file.startsWith('page-') && file.endsWith('.png'));
  for (const file of pageFiles) {
    fs.unlinkSync(path.join(outputDir, file));
}

  return fullText;
}

// Example usage:
// (async () => {
//   try {
//     const pdfFilePath = "E:/VSProjects/node-rag/temp-hmhpech_hgenetit.pdf"; // Replace with your PDF path
//     const imagesDir = "./images"; // Or "./images" or any path you like
//     const language = "heb+eng"; // e.g. "eng", "heb", etc.

//     const extractedText = await pdfToText(pdfFilePath, imagesDir, language);
    
    

//     console.log("=== OCR Extracted Text ===");
//     console.log(extractedText);
//   } catch (err) {
//     console.error("Error converting PDF to text:", err);
//   }
// })();
