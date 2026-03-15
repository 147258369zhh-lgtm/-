use std::process::Command;
use std::path::{Path, PathBuf};
use eyre::{Result, Context};
use tracing::{info, warn, error};

/// Converts an Office document (Word, Excel, PPT) to PDF using PowerShell and COM objects.
/// Note: This requires Microsoft Office or WPS Office installed on the Windows machine.
pub fn convert_office_to_pdf(input_path: &Path, output_dir: &Path) -> Result<PathBuf> {
    let input_path_str = input_path.to_str().ok_or_else(|| eyre::eyre!("Invalid input path"))?;
    
    // Generate output path
    let file_stem = input_path.file_stem().unwrap_or_default().to_string_lossy();
    let output_filename = format!("{}.pdf", file_stem);
    let output_path = output_dir.join(output_filename);
    let output_path_str = output_path.to_str().ok_or_else(|| eyre::eyre!("Invalid output path"))?;
    
    // Check if output already exists to avoid redundant conversion
    if output_path.exists() {
        info!("PDF already exists for {}, returning cached version.", input_path_str);
        return Ok(output_path);
    }
    
    let ext = input_path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
    
    let ps_script = match ext.as_str() {
        "doc" | "docx" => {
            format!(
                r#"
                $word = New-Object -ComObject Word.Application
                $word.Visible = $false
                try {{
                    $doc = $word.Documents.Open('{}', $null, $true) # ReadOnly
                    $doc.SaveAs([ref] '{}', [ref] 17) # 17 is wdFormatPDF
                    $doc.Close($false)
                }} finally {{
                    $word.Quit()
                    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
                }}
                "#,
                input_path_str.replace("'", "''"), 
                output_path_str.replace("'", "''")
            )
        },
        "xls" | "xlsx" => {
            format!(
                r#"
                $excel = New-Object -ComObject Excel.Application
                $excel.Visible = $false
                $excel.DisplayAlerts = $false
                try {{
                    $wb = $excel.Workbooks.Open('{}', $null, $true) # ReadOnly
                    
                    # Auto-scale every sheet to fit all columns into 1 page wide
                    foreach ($sheet in $wb.Sheets) {{
                        $sheet.PageSetup.Zoom = $false
                        $sheet.PageSetup.FitToPagesWide = 1
                        $sheet.PageSetup.FitToPagesTall = $false
                    }}
                    
                    $wb.ExportAsFixedFormat(0, '{}') # 0 is xlTypePDF
                    $wb.Close($false)
                }} finally {{
                    $excel.Quit()
                    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
                }}
                "#,
                input_path_str.replace("'", "''"), 
                output_path_str.replace("'", "''")
            )
        },
        "ppt" | "pptx" => {
            // Note: PowerPoint COM doesn't always close cleanly in background, extra care needed
            format!(
                r#"
                $ppt = New-Object -ComObject PowerPoint.Application
                # PowerPoint often requires MsoTriState::msoTrue for visibility depending on version, 
                # but we try to keep it minimized or hidden. 
                # $ppt.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue
                try {{
                    $presentation = $ppt.Presentations.Open('{}', -1, 0, 0) # ReadOnly, Untitled, WithWindow=msoFalse
                    $presentation.ExportAsFixedFormat('{}', 2) # 2 is ppFixedFormatTypePDF
                    $presentation.Close()
                }} finally {{
                    $ppt.Quit()
                    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
                }}
                "#,
                input_path_str.replace("'", "''"), 
                output_path_str.replace("'", "''")
            )
        },
        _ => return Err(eyre::eyre!("Unsupported file extension: {}", ext)),
    };

    info!("Starting background PDF conversion for: {}", input_path_str);
    
    // Execute the PowerShell script
    let output = Command::new("powershell")
        .args(&["-NoProfile", "-NonInteractive", "-Command", &ps_script])
        .output()
        .wrap_err("Failed to execute PowerShell for PDF conversion")?;
        
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("PowerShell conversion failed: {}", stderr);
        return Err(eyre::eyre!("PDF Conversion failed. Please ensure MS Office is installed. Error: {}", stderr));
    }
    
    if !output_path.exists() {
        return Err(eyre::eyre!("PowerShell script succeeded but output PDF was not found at {}", output_path_str));
    }
    
    info!("Successfully converted {} to PDF", input_path_str);
    Ok(output_path)
}
