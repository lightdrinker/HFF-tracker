import * as XLSX from 'xlsx-js-style'
import { NUTRIENT_COLUMNS, getRdaExcelColor, getRdaExcelTextColor } from '../config/nutrients'
import { parseStdrStnd } from './parseStdrStnd'

export function exportNutrientExcel(rows) {
  // Header row 1: 제품명, 회사명, 영양성분>> (merged concept), ..., 기타 기능성원료
  const header1 = [
    '제품명',
    '회사명',
    ...NUTRIENT_COLUMNS.map(n => n.name),
    '기타 기능성원료',
  ]

  // Header row 2: blank, blank, RDA values, blank
  const header2 = [
    '',
    '',
    ...NUTRIENT_COLUMNS.map(n => `${n.rda} ${n.unit}`),
    '',
  ]

  // Data rows
  const dataRows = rows.map(row => {
    const parsed = parseStdrStnd(row.STDR_STND)
    return [
      row.PRDLST_NM || '',
      row.BSSH_NM || '',
      ...NUTRIENT_COLUMNS.map(n => parsed.nutrients[n.key] ?? ''),
      parsed.others.length > 0 ? parsed.others.join(', ') : '',
    ]
  })

  const aoa = [header1, header2, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Style header row 1
  const totalCols = header1.length
  for (let c = 0; c < totalCols; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (ws[addr]) {
      ws[addr].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
        fill: { patternType: 'solid', fgColor: { rgb: '374151' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: thinBorder(),
      }
    }
  }

  // Style header row 2 (RDA)
  for (let c = 0; c < totalCols; c++) {
    const addr = XLSX.utils.encode_cell({ r: 1, c })
    if (ws[addr]) {
      ws[addr].s = {
        font: { color: { rgb: '6B7280' }, sz: 10 },
        fill: { patternType: 'solid', fgColor: { rgb: 'F3F4F6' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: thinBorder(),
      }
    }
  }

  // Style data cells with RDA% coloring
  for (let r = 0; r < dataRows.length; r++) {
    const excelRow = r + 2 // 0-indexed, after 2 header rows
    for (let c = 0; c < totalCols; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c })
      if (!ws[addr]) continue

      // Nutrient columns: index 2 ~ 26 (NUTRIENT_COLUMNS.length = 25)
      if (c >= 2 && c < 2 + NUTRIENT_COLUMNS.length) {
        const nutrientIdx = c - 2
        const nutrient = NUTRIENT_COLUMNS[nutrientIdx]
        const val = dataRows[r][c]

        if (val !== '' && typeof val === 'number') {
          const bgColor = getRdaExcelColor(val, nutrient.rda)
          const textColor = getRdaExcelTextColor(val, nutrient.rda)
          ws[addr].s = {
            font: { bold: true, color: { rgb: textColor }, sz: 11 },
            fill: { patternType: 'solid', fgColor: { rgb: bgColor } },
            alignment: { horizontal: 'center' },
            border: thinBorder(),
          }
        } else {
          ws[addr].s = {
            alignment: { horizontal: 'center' },
            border: thinBorder(),
          }
        }
      } else {
        // 제품명, 회사명, 기타 기능성원료
        ws[addr].s = {
          border: thinBorder(),
          alignment: c === totalCols - 1 ? { wrapText: true } : {},
        }
      }
    }
  }

  // Column widths
  ws['!cols'] = [
    { wch: 35 },  // 제품명
    { wch: 20 },  // 회사명
    ...NUTRIENT_COLUMNS.map(() => ({ wch: 12 })),
    { wch: 40 },  // 기타
  ]

  // Freeze panes: first 2 columns + first 2 rows
  ws['!freeze'] = { xSplit: 2, ySplit: 2, topLeftCell: 'C3' }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '성분 함량 분석')
  XLSX.writeFile(wb, `성분함량분석_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function thinBorder() {
  const side = { style: 'thin', color: { rgb: 'D1D5DB' } }
  return { top: side, bottom: side, left: side, right: side }
}
