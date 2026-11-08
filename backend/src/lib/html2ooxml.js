var docx = require("docx")
var xml = require("xml")
var htmlparser = require("htmlparser2")
var domutils = require("domutils")
const render = require('dom-serializer').default
const hljs = require('highlight.js');

let tableDefaults = {
    border: { _attr: { "w:val": "single", "w:color": "FFFFFF", "w:sz": 24, "w:themeColor": "background1", "w:space": 0 } },
    "w:rPr": { header: { "w:rPr": [
        { "w:color": { _attr: { "w:val": "FFFFFF", "w:themeColor": "background1" } } },
        { "w:b": { _attr: { "w:val": "true" } } }
    ] } },
    "w:pPr": [ { "w:spacing": { _attr: { "w:after": 0, "w:line": 276, "w:lineRule": "auto" } } } ],
    "w:shd": {
        header: { "w:shd": { _attr: { "w:val": "clear", "w:color": "auto", "w:fill": "2DA3DE" } } },
        rowu: { "w:shd": { _attr: { "w:val": "clear", "w:color": "auto", "w:fill": "D9D9D9" } } },
        rowe: { "w:shd": { _attr: { "w:val": "clear", "w:color": "auto", "w:fill": "F2F2F2" } } }
    },
    "w:gridSpan": { "w:gridSpan": { _attr: { "w:val": 1 } } }
};

function html2ooxml(html, style = '') {
    if (html === '')
        return html
    if (!html.match(/^<.+>/))
        html = `<p>${html}</p>`
    html = html.replace(/<comment.*?>/g, '').replace(/<\/comment>/g, '') // Clean comment tags
    var doc = new docx.Document({sections:[]});
    var paragraphs = []
    var cParagraph = null
    var cRunProperties = {}
    var cParagraphProperties = {}
    var list_state = []
    var inCodeBlock = false
    // BEGIN CUSTOM ADDITION
    let inTable = false;
    let inTableRow = false;
    let inTableCell = false;
    let cellHasText = false;
    let tmpAttribs = {};
    let tableHeader = false
    let tmpTable = [];
    let tmpCells = [];
    let tmpCellContent = [];
    // END CUSTOM ADDITION
    var parser = new htmlparser.Parser(
    {
        onopentag(tag, attribs) {
            // CUSTOM ADDITION: Changed if/elseif with switch/case
            switch (tag) {
                case "h1":
                    cParagraph = new docx.Paragraph({heading: 'Heading1'})
                    break
                case "h2":
                    cParagraph = new docx.Paragraph({heading: 'Heading2'})
                    break
                case "h3":
                    cParagraph = new docx.Paragraph({heading: 'Heading3'})
                    break
                case "h4":
                    cParagraph = new docx.Paragraph({heading: 'Heading4'})
                    break
                case "h5":
                    cParagraph = new docx.Paragraph({heading: 'Heading5'})
                    break
                case "h6":
                    cParagraph = new docx.Paragraph({heading: 'Heading6'})
                    break
                case "div":
                case "p":
                    if (style && typeof style === 'string')
                        cParagraphProperties.style = style
                    cParagraph = new docx.Paragraph(cParagraphProperties)
                    break
                case "pre":
                    inCodeBlock = true
                    cParagraph = new docx.Paragraph({style: "Code"})
                    break
                case "b":
                case "strong":
                    cRunProperties.bold = true
                    break
                case "i":
                case "em":
                    cRunProperties.italics = true
                    break
                case "u":
                    cRunProperties.underline = {}
                    break
                case "strike":
                case "s":
                    cRunProperties.strike = true
                    break
                case "mark": {
                    var bgColor = attribs["data-color"] || "#ffff25"
                    cRunProperties.highlight = getHighlightColor(bgColor)

                    // Use text color if set (to handle white or black text depending on background color)
                    var color = attribs.style && attribs.style.match(/.+color:.(.+)/)
                    if (color && color[1]) cRunProperties.color = getTextColor(color[1])
                    break
                }
                case "br":
                    if (inCodeBlock) {
                        paragraphs.push(cParagraph)
                        cParagraph = new docx.Paragraph({style: "Code"})
                    }
                    else
                        cParagraph.addChildElement(new docx.Run({break: 1}))
                    break
                case "ul":
                    list_state.push('bullet')
                    break
                case "ol":
                    list_state.push('number')
                    break
                case "li": {
                    var level = list_state.length - 1
                    if (level >= 0 && list_state[level] === 'bullet')
                        cParagraphProperties.bullet = {level: level}
                    else if (level >= 0 && list_state[level] === 'number')
                        cParagraphProperties.numbering = {reference: 2, level: level}
                    else
                        cParagraphProperties.bullet = {level: 0}
                    break
                }
                case "code":
                    cRunProperties.style = "CodeChar"
                    break
                case "legend":
                    if (attribs && attribs.alt !== "undefined") {
                        var label = attribs.label || "Figure"
                        cParagraph = new docx.Paragraph({style: "Caption", alignment: docx.AlignmentType.CENTER})
                        cParagraph.addChildElement(new docx.TextRun(`${label} `))
                        cParagraph.addChildElement(new docx.SimpleField(`SEQ ${label}`, '1'))
                        cParagraph.addChildElement(new docx.TextRun(` - ${attribs.alt}`))
                    }
                    break
                case "span":
                    if (inCodeBlock) {
                        var hljsClassName = attribs["class"];

                        if (hljsClassName === "hljs-doctag" || hljsClassName === "hljs-keyword" || hljsClassName === "hljs-formula") {
                            cRunProperties.color = "c678dd";
                        } else if (hljsClassName === "hljs-section" || hljsClassName === "hljs-name" || hljsClassName === "hljs-selector-tag" || hljsClassName === "hljs-deletion" || hljsClassName === "hljs-subst") {
                            cRunProperties.color = "e06c75";
                        } else if (hljsClassName === "hljs-literal") {
                            cRunProperties.color = "56b6c2";
                        } else if (hljsClassName === "hljs-string" || hljsClassName === "hljs-regexp" || hljsClassName === "hljs-addition" || hljsClassName === "hljs-attribute") {
                            cRunProperties.color = "98c379";
                        } else if (hljsClassName === "hljs-attr" || hljsClassName === "hljs-variable" || hljsClassName === "hljs-template-variable" || hljsClassName === "hljs-type" || hljsClassName === "hljs-selector-class" || hljsClassName === "hljs-selector-attr" || hljsClassName === "hljs-selector-pseudo" || hljsClassName === "hljs-number") {
                            cRunProperties.color = "d19a66";
                        } else if (hljsClassName === "hljs-symbol" || hljsClassName === "hljs-bullet" || hljsClassName === "hljs-link" || hljsClassName === "hljs-meta" || hljsClassName === "hljs-selector-id" || hljsClassName === "hljs-title") {
                            cRunProperties.color = "61aeee";
                        } else if (hljsClassName === "hljs-built_in" || hljsClassName === "hljs-class_" || hljsClassName === "hljs-class") {
                            cRunProperties.color = "e6c07b";
                        } else if (hljsClassName === "hljs-comment" || hljsClassName === "hljs-quote") {
                            cRunProperties.color = "5c6370";
                            cRunProperties.italics = true;
                        }
                    }
                    break
                // BEGIN CUSTOM ADDITION
                case 'a':
                    cRunProperties.link = attribs.href;
                    break;
                case 'table':
                    inTable = true;
                    break;
                case 'td':
                    tmpAttribs = attribs;
                    inTableCell = true;
                    cellHasText = false;
                    tmpCellContent = [];
                    break;
                case 'th':
                    inTableCell = true;
                    tableHeader = true;
                    tmpAttribs = attribs;
                    tmpCellContent = [];
                    cellHasText = false;
                    break;
                case 'tr':
                    inTableRow = true;
                    break;
                // END CUSTOM ADDITION
            }
        },

        ontext(text) {
            if (text && cParagraph) {
                // BEGIN CUSTOM ADDITION
                if (inTableCell) {
                    cellHasText = true;
                }
                // END CUSTOM ADDITION
                cRunProperties.text = text;
                cParagraph.addChildElement(new docx.TextRun(cRunProperties));
            // BEGIN CUSTOM ADDITION
            } else if (cRunProperties.link) {
                cParagraph.addChildElement(new docx.TextRun({ "text": `{_|link|_{${text}|-|${cRunProperties.link}}_|link|_}`, "style": "PwndocLink" }));
            } else if (inCodeBlock) {
                if (cRunProperties.color) {
                    cParagraph.addChildElement(new docx.TextRun({text, color: cRunProperties.color}));
                } else {
                    cParagraph.addChildElement(new docx.TextRun({text}));
                }
            // END CUSTOM ADDITION
            }
        },

        onclosetag(tag) {
            // CUSTOM ADDITION: Use switch/case instead of if/elseif to match tag
            switch (tag) {
                case 'h1':
                case 'h2':
                case 'h3':
                case 'h4':
                case 'h5':
                case 'h6':
                case 'div':
                case 'p':
                case 'pre':
                case 'legend':
                    // CUSTOM EDIT: push to cell content if in table
                    if (inTableCell) {
                        tmpCellContent.push(cParagraph)
                    } else {
                        paragraphs.push(cParagraph);
                    }
                    // END CUSTOM EDIT
                    cParagraph = null
                    cParagraphProperties = {}
                    if (tag === 'pre')
                        inCodeBlock = false
                    break
                case 'b':
                case 'strong':
                    delete cRunProperties.bold
                    break
                case 'i':
                case 'em':
                    delete cRunProperties.italics
                    break
                case 'u':
                    delete cRunProperties.underline
                    break
                case 'strike':
                case 's':
                    delete cRunProperties.strike
                    break
                case 'mark':
                    delete cRunProperties.highlight
                    delete cRunProperties.color
                    break
                case 'ul':
                case 'ol':
                    list_state.pop()  // NOTE: might require additions to work, see original additions in pwndoc-ng
                    if (list_state.length === 0)
                        cParagraphProperties = {}
                    break
                case 'code':
                    delete cRunProperties.style
                case 'span':
                    if (inCodeBlock) {
                        delete cRunProperties.color
                        delete cRunProperties.italics
                    }
                    break
                // BEGIN CUSTOM ADDITION
                case 'a':
                    delete cRunProperties.link
                    break
                case 'tr':
                    inTableRow = false;
                    tableHeader = false;
                    tmpTable.push(tmpCells);
                    tmpCells = []
                    break
                case 'td':
                case 'th':
                    const sanitizedContent = (Array.isArray(tmpCellContent) && tmpCellContent.length > 0)
                        ? tmpCellContent.filter(p => p !== null)
                        : [new docx.Paragraph("")];

                    tmpCells.push({
                        text: sanitizedContent,
                        width: tmpAttribs.colwidth || "250",
                        header: tableHeader,
                    });

                    tmpAttribs = {};
                    tmpCellContent = [];
                    inTableCell = false;
                    break
                case 'table':
                    inTable = false;
                    let tblRows = [];
                    tmpTable.map((row) => {
                        let tmpCells = [];
                        let isHeader = false
                        let widthTotal = row
                            .map(cell => parseInt(cell.width || "250", 10))
                            .reduce((prev, next) => prev + next, 0) || 1; // avoid division by zero

                        // Note on width of table cell and table itself:
                        // 'pct' is fiftieths-of-a-percent. i.e., 5000 = 100%
                        // see https://ooxml.org/wordml/w-tblw/
                        row.map((cell) => {
                            isHeader = cell.header;
                            tmpCells.push(new docx.TableCell({
                                width: {
                                    size: Math.round((cell.width / widthTotal) * 5000),
                                    type: "pct",
                                },
                                children: cell.text,
                            }))
                            tmpCells.forEach((v) => console.log(v))
                        });

                        tblRows.push(new docx.TableRow({
                            children: tmpCells,
                            tableHeader: isHeader,
                        }))
                    });
                    // build table and push to paragraphs array
                    cParagraph = new docx.Table({
                        rows: tblRows,
                        width: {
                            size: 5000,
                            type: "pct"
                        }
                    });
                    console.log(cParagraph)
                    tblRows.forEach((v) => console.log(v, '\n'))
                    console.log()
                    console.log()

                    paragraphs.push(cParagraph);
                    cParagraph = null;
                    cParagraphProperties = {};
                    tmpTable = [];
                    tmpCells = [];
                    break
                // END CUSTOM ADDITION
            }
        },

        onend() {
            // BEGIN CUSTOM ADDITION: is this required? Why was it in pwndoc-ng?
            if (paragraphs.length === 0) {
                paragraphs.push(new docx.Paragraph(""));
            }
            // END CUSTOM ADDITION
            doc.addSection({
                children: paragraphs
            })
        }
    }, { decodeEntities: true })

    var htmlObject = htmlparser.parseDocument(html);
    var codeObjects = domutils.getElementsByTagName('code', htmlObject);

    for (let codeIndex = 0; codeIndex < codeObjects.length; codeIndex++) {
        let codeClass = codeObjects[codeIndex].attribs.class
        let codeLanguage = (codeClass && codeClass.split('-')[1]) || 'plaintext'
        let codeText = codeObjects[codeIndex].children[0] ? codeObjects[codeIndex].children[0].data : ''
        codeObjects[codeIndex].children[0] = htmlparser.parseDocument(hljs.highlight(codeText, {language: codeLanguage}).value);
    }

    // For multiline code blocks
    html = render(htmlObject).replace(/\n/g, '<br>')
    parser.write(html)
    parser.end()

    var prepXml = doc.documentWrapper.document.body.prepForXml({ stack: [] })
    var filteredXml = prepXml["w:body"].filter(e => {return e && Object.keys(e)[0] === "w:p" || Object.keys(e)[0] === "w:tbl"})  // CUSTOM ADDITION: also match op w:tbl
    
    // BEGIN CUSTOM ADDITION
    let traverseTable = (obj, inTable, isHeader) => {
        if (typeof obj != "object")  // exit condition
        return obj;

        Object.keys(obj).map((key, idx) => {
            if (!inTable) {
                obj[key] = traverseTable(obj[key], key == "w:tbl", isHeader);
                return obj;
            }
            switch (key) {
                case "w:tblPr":
                    obj[key] = traverseTable(obj[key], inTable, isHeader);
                    obj[key].unshift({"w:tblLayout": {"_attr": {"w:type": "fixed"}}});
                    obj[key].unshift({"w:tblStyle": {"_attr": {"w:val": "TableGrid"}}});
                    break;
                case "w:tblBorders":
                    obj[key] = [
                        {"w:top": tableDefaults['border']},
                        {"w:left": tableDefaults['border']},
                        {"w:bottom": tableDefaults['border']},
                        {"w:right": tableDefaults['border']},
                        {"w:insideH": tableDefaults['border']},
                        {"w:insideV": tableDefaults['border']},
                    ];
                    break;
                case "w:tr":
                    isHeader = obj[key].map((e) => ("w:trPr" in e && (Object.keys(e["w:trPr"][0]["w:tblHeader"]).length == 0 ||
                                                                        ("_attr" in e["w:trPr"][0]["w:tblHeader"] &&
                                                                        "w:val" in e["w:trPr"][0]["w:tblHeader"]["_attr"] &&
                                                                        e["w:trPr"][0]["w:tblHeader"]["_attr"]["w:val"])))
                                            ).some((e) => e);
                    rowNumber = (isHeader) ? 0 : rowNumber + 1;
                    obj[key] = traverseTable(obj[key], inTable, isHeader);
                    break;
                case "w:tcPr":
                    obj[key] = traverseTable(obj[key], inTable, isHeader)
                    obj[key].unshift(tableDefaults['w:shd'][isHeader ? 'header' : (rowNumber % 2 == 0 ? 'rowe' : 'rowu')]);
                    obj[key].unshift(tableDefaults['w:gridSpan']);
                    break;
                case "w:pPr":
                    obj[key] = tableDefaults['w:pPr'];
                    break;
                case "w:r":
                    obj[key] = traverseTable(obj[key], inTable, isHeader)
                    if (isHeader)
                        obj[key].unshift(tableDefaults['w:rPr']['header']);
                    break;
                default:
                    obj[key] = traverseTable(obj[key], inTable, isHeader);
            }
        });
        return obj;
    }
    let rowNumber = 0;
    traverseTable(filteredXml, false, false);
    // END CUSTOM ADDITION
    
    var dataXml = xml(filteredXml)
    dataXml = dataXml.replace(/w:numId w:val="{(\d+)-0}"/g, 'w:numId w:val="$1"'); // Replace numbering to have correct value, CUSTOM ADDITION added (\d+), copy from later commit in pwndoc-ng. Not sure why this is better.

    // BEGIN CUSTOM ADDITION: copy from pwndoc-ng, probably to do with link support?
    //a little dirty but until we do better it works
    dataXml = dataXml.replace(/\{_\|link\|_\{(.*?)\|\-\|(.*?)\}_\|link\|_\}/gm, '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> HYPERLINK $2 </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:rStyle w:val="PwndocLink"/></w:rPr><w:t> $1 </w:t> </w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>')
    // END CUSTOM ADDITION

    return dataXml
        
}
module.exports = html2ooxml

function getHighlightColor(hexColor) {
// <xsd:simpleType name="ST_HighlightColor">
//     <xsd:restriction base="xsd:string">
//         <xsd:enumeration value="yellow"/>
//         <xsd:enumeration value="green"/>
//         <xsd:enumeration value="cyan"/>
//         <xsd:enumeration value="magenta"/>
//         <xsd:enumeration value="blue"/>

//         <xsd:enumeration value="red"/>
//         <xsd:enumeration value="darkBlue"/>
//         <xsd:enumeration value="darkCyan"/>
//         <xsd:enumeration value="darkGreen"/>
//         <xsd:enumeration value="darkMagenta"/>

//         <xsd:enumeration value="darkRed"/>
//         <xsd:enumeration value="darkYellow"/>
//         <xsd:enumeration value="darkGray"/>
//         <xsd:enumeration value="lightGray"/>
//         <xsd:enumeration value="black"/>

//         <xsd:enumeration value="white"/>
//         <xsd:enumeration value="none"/>
//     </xsd:restriction>
// </xsd:simpleType>

    var colors = {
        '#ffff25': 'yellow',
        '#00ff41': 'green',
        '#00ffff': 'cyan',
        '#ff00f9': 'magenta',
        '#0005fd': 'blue',
        '#ff0000': 'red',
        '#000177': 'darkBlue',
        '#00807a': 'darkCyan',
        '#008021': 'darkGreen',
        '#8e0075': 'darkMagenta',
        '#8f0000': 'darkRed',
        '#817d0c': 'darkYellow',
        '#807d78': 'darkGray',
        '#c4c1bb': 'lightGray',
        '#000000': 'black'
    }
    return colors[hexColor] || "yellow"
}

function getTextColor(color) {
    var regex = /^#[0-9a-fA-F]{6}$/
    if (regex.test(color))
        return color.substring(1,7)
    
    return "000000" 
}