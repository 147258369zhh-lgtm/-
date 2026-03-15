import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ExcelJS from 'exceljs';
import { readFile, writeFile, mkdir } from '@tauri-apps/plugin-fs';
import { path } from '@tauri-apps/api';

export interface FillResult {
    success: boolean;
    outputPath?: string;
    error?: string;
}

/**
 * 文件自动化引擎
 * 处理 Word 模板的动态填充与生成
 */
export class FileAutomationEngine {
    /**
     * 填充 Word 文档
     * @param templatePath 模板文件的绝对路径
     * @param data 填充的数据对象 (Key-Value)
     * @param projectPath 项目根路径 (用于存储生成的成果)
     * @param outputFileName 输出文件名
     */
    static async fillWord(
        templatePath: string,
        data: Record<string, any>,
        projectPath: string,
        outputFileName: string,
        outputDirName = '输出成果'
    ): Promise<FillResult> {
        try {
            // 1. 读取模板二进制数据
            const content = await readFile(templatePath);
            const zip = new PizZip(content);
            
            // 2. 初始化 Docxtemplater
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
            });

            // 3. 渲染数据 (动态映射)
            // 这里的 data 可以包含项目的所有原始字段，docxtemplater 会自动匹配 {{Key}}
            doc.render(data);

            // 4. 生成 Buffer
            const buf = doc.getZip().generate({
                type: 'uint8array',
                compression: 'DEFLATE',
            });

            // 5. 确保输出目录存在 (项目下的输出目录)
            const outputDir = await path.join(projectPath, outputDirName);
            try {
                await mkdir(outputDir, { recursive: true });
            } catch (e) {
                // 如果目录已存在，通常会抛错，这里简单处理
            }

            const targetPath = await path.join(outputDir, outputFileName);

            // 6. 写入文件
            await writeFile(targetPath, buf);

            return {
                success: true,
                outputPath: targetPath
            };
        } catch (error: any) {
            console.error('Word 填充失败:', error);
            return {
                success: false,
                error: error.message || String(error)
            };
        }
    }

    /**
     * 填充 Excel 文档
     * @param templatePath 模板文件的绝对路径
     * @param data 填充的数据对象 (Key-Value)
     * @param projectPath 项目根路径
     * @param outputFileName 输出文件名
     */
    static async fillExcel(
        templatePath: string,
        data: Record<string, any>,
        projectPath: string,
        outputFileName: string,
        outputDirName = '输出成果'
    ): Promise<FillResult> {
        try {
            // 1. 读取模板
            const content = await readFile(templatePath);
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(content.buffer);

            // 2. 遍历所有工作表进行占位符替换
            workbook.eachSheet((sheet) => {
                sheet.eachRow((row) => {
                    row.eachCell((cell) => {
                        const cellValue = cell.value;
                        if (typeof cellValue === 'string') {
                            let newText = cellValue;
                            let hasMatch = false;

                            // 匹配 {{Key}} 模式
                            const regex = /\{\{\s*([^} ]+)\s*\}\}/g;
                            newText = cellValue.replace(regex, (match, key) => {
                                if (data[key] !== undefined) {
                                    hasMatch = true;
                                    return String(data[key]);
                                }
                                return match;
                            });

                            if (hasMatch) {
                                cell.value = newText;
                            }
                        }
                    });
                });
            });

            // 3. 生成 Buffer
            const buf = await workbook.xlsx.writeBuffer();

            // 4. 确保输出目录存在
            const outputDir = await path.join(projectPath, outputDirName);
            try {
                await mkdir(outputDir, { recursive: true });
            } catch (e) {}

            const targetPath = await path.join(outputDir, outputFileName);

            // 5. 写入文件
            await writeFile(targetPath, new Uint8Array(buf));

            return {
                success: true,
                outputPath: targetPath
            };
        } catch (error: any) {
            console.error('Excel 填充失败:', error);
            return {
                success: false,
                error: error.message || String(error)
            };
        }
    }
}
