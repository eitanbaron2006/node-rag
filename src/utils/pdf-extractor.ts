import { createWorker } from 'tesseract.js';
import * as pdf from 'pdf-poppler';
import path from 'path';
import fs from 'fs/promises';
import process from "node:process";
import console from 'node:console';

/**
 * Converts PDF pages to images
 * @param pdfPath Path to the PDF file
 * @param outputDir Directory to save the images
 * @returns Array of paths to the generated image files
 */
async function pdfToImages(pdfPath: string, outputDir: string): Promise<string[]> {
  console.log('in pdfToImages');
  const opts: pdf.ConvertOptions = {
    format: 'png',
    out_dir: outputDir,
    out_prefix: path.basename(pdfPath, path.extname(pdfPath)),
    page: null,
    density: 300, // Higher DPI for better text recognition
    scale: 2 // Scale up for better quality
  };

  try {
    await pdf.convert(pdfPath, opts);
    
    // Get list of generated image files
    const files = await fs.readdir(outputDir);
    const imageFiles = files
      .filter(file => file.startsWith(opts.out_prefix) && file.endsWith('.png'))
      .map(file => path.join(outputDir, file));
    
    return imageFiles;
  } catch (err) {
    console.error('Error converting PDF to images:', err);
    throw err;
  }
}

/**
 * Extracts Hebrew text from images using Tesseract.js
 * @param imagePaths Array of paths to image files
 * @returns Combined text from all images
 */
async function extractHebrewTextFromImages(imagePaths: string[]): Promise<string> {
  console.log('in extractHebrewTextFromImages');
  // Initialize worker with Hebrew language
  const worker = await createWorker();

  try {
    // Initialize with Hebrew language
    await worker.reinitialize('heb');

    let combinedText = '';

    // Process each image
    for (const imagePath of imagePaths) {
      const { data: { text } } = await worker.recognize(imagePath);
      combinedText += text + '\n';
      
      // Clean up the image file after processing
      await fs.unlink(imagePath).catch(console.error);
    }

    await worker.terminate();
    return combinedText.trim();
  } catch (err) {
    console.error('Error extracting text from images:', err);
    throw err;
  }
}

/**
 * Main function to extract Hebrew text from a PDF file
 * @param pdfPath Path to the PDF file
 * @returns Extracted Hebrew text from the PDF
 */
export async function extractHebrewTextFromPDF(pdfPath: string): Promise<string> {
  console.log('in extractHebrewTextFromPDF');
  try {
    // Get PDF info first
    const info = await pdf.info(pdfPath);
    console.log('Processing PDF with', info.pages, 'pages');

    // Create temporary directory for images
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Convert PDF to images
      const imagePaths = await pdfToImages(pdfPath, tempDir);
      console.log('Converted PDF to', imagePaths.length, 'images');

      // Extract text from images
      const text = await extractHebrewTextFromImages(imagePaths);
      console.log('Extracted', text.length, 'characters of text');

      return text;
    } finally {
      // Clean up temporary directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Error cleaning up temp directory:', cleanupError);
      }
    }
  } catch (err) {
    console.error('Error extracting text from PDF:', err);
    throw err;
  }
}