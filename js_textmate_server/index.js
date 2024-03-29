const fs = require('fs');
const path = require('path');
const vsctm = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');
const cluster = require('cluster');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const utils = require('./utils')

const wasmBin = fs.readFileSync(path.join(__dirname, './node_modules/vscode-oniguruma/release/onig.wasm')).buffer;
const vscodeOnigurumaLib = oniguruma.loadWASM(wasmBin).then(() => {
    return {
        createOnigScanner(patterns) { return new oniguruma.OnigScanner(patterns); },
        createOnigString(s) { return new oniguruma.OnigString(s); }
    };
});

cluster.schedulingPolicy = cluster.SCHED_RR;
const worker = cluster.worker;
let workCount = 0

const languageMap = {
    'source.js': 'tmLanguage/JavaScript.tmLanguage.json',
    'source.cpp': 'tmLanguage/cpp.tmLanguage.json',
    'source.c': 'tmLanguage/c.tmLanguage.json',
}
const registryMap = {}
for (let [scopeKey, tmLanguageFilePath] of Object.entries(languageMap)) {
    registryMap[scopeKey] = new vsctm.Registry({
        onigLib: vscodeOnigurumaLib,
        loadGrammar: () => {
            let grammarPath = path.resolve(__dirname, tmLanguageFilePath);;
            return Promise.resolve(vsctm.parseRawGrammar(fs.readFileSync(grammarPath).toString(), grammarPath));

        }
    });
}

// const PROTO_PATH = fs.readFileSync(path.resolve(__dirname, './../protos/text_mate.proto'), 'utf8')
const PROTO_PATH = path.resolve(__dirname, './../protos/text_mate.proto')
const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });

const ServerAddress = '0.0.0.0'
const BasicPort = 40050

const textMate_proto = grpc.loadPackageDefinition(packageDefinition).textMate;

function containsAll(originArray, includeArrays, excludeArrays = []) {
    const allIncluded = includeArrays.every(value => originArray.includes(value));
    if (allIncluded == false)
        return false
    return excludeArrays.every(value => !originArray.includes(value));

}
const code_str_count = (code_list) => {
    let count = 0;
    code_list.forEach(text => {
        // 使用正则表达式去除所有空白字符
        const cleanedText = text.replace(/\s+/g, '');
        // 统计字符数量
        count += cleanedText.length;
    });
    return count;
};

function handleLineTokensCpp(lineTokens, line) {

    const retObj = {
        func_name: null,
        func_static: false,
        ref_func_name_list: [],
    }


    console.log(`\nTokenizing line: ${line}`);
    for (let j = 0; j < lineTokens.tokens.length; j++) {
        const token = lineTokens.tokens[j];
        console.log(` - token from ${token.startIndex} to ${token.endIndex} ` +
            `(${line.substring(token.startIndex, token.endIndex)}) ` +
            `with scopes ${token.scopes.join(', ')}`
        );

        if (containsAll(token.scopes, ["entity.name.function.definition.cpp"])) {
            const func_name = line.substring(token.startIndex, token.endIndex)
            retObj.func_name = func_name
        }
        if (containsAll(token.scopes, ["storage.modifier.static.cpp"])) {
            retObj.func_static = true
        }

        if (containsAll(token.scopes, ["entity.name.function.call.cpp"])) {
            const func_name = line.substring(token.startIndex, token.endIndex)
            retObj.ref_func_name_list.push(func_name)
        }

    }

}


function handleLineTokensC(lineTokens, line) {

    const retObj = {
        func_name: "",
        func_static: false,
        oneline_func: false,
        define: false,
        macro_name: "",
        punctuation_terminator: false, //行内有中断标记， 此处可以表明函数已经开始或者结束
        ref_func_name_list: [],
        bracket_begin_count: 0,
        bracket_end_count: 0,
        global_include: [],
        local_include: []
    }


    // console.log(`\nTokenizing line: ${line}`);
    for (let j = 0; j < lineTokens.tokens.length; j++) {
        const token = lineTokens.tokens[j];
        // console.log(` - token from ${token.startIndex} to ${token.endIndex} ` +
        //     `(${line.substring(token.startIndex, token.endIndex)}) ` +
        //     `with scopes ${token.scopes.join(', ')}`
        // );

        if (containsAll(token.scopes, ["meta.function.c", "entity.name.function.c"], ["meta.preprocessor.macro.c", "meta.block.c"])) {
            const func_name = line.substring(token.startIndex, token.endIndex)
            retObj.func_name = func_name
        }
        if (containsAll(token.scopes, ["storage.modifier.c"])) {
            if ('static' === line.substring(token.startIndex, token.endIndex))
                retObj.func_static = true
        }
        if (containsAll(token.scopes, ["keyword.control.directive.define.c", "punctuation.definition.directive.c"])) {
            retObj.define = true
        }
        if (containsAll(token.scopes, ["meta.preprocessor.macro.c", "entity.name.function.preprocessor.c"])) {
            const macro_name = line.substring(token.startIndex, token.endIndex)
            retObj.macro_name = macro_name
        }
        if (containsAll(token.scopes, ["meta.function-call.c", "entity.name.function.c"]) ||
            containsAll(token.scopes, ["meta.block.c", "entity.name.function.member.c"]) ||
            containsAll(token.scopes, ["meta.block.c", "entity.name.function.c"])
        ) {
            const func_name = line.substring(token.startIndex, token.endIndex)
            retObj.ref_func_name_list.push(func_name)
        }
        if (containsAll(token.scopes, ["punctuation.section.block.end.bracket.curly.c"])) {
            retObj.bracket_end_count += 1
        }
        if (containsAll(token.scopes, ["punctuation.section.block.begin.bracket.curly.c"])) {
            retObj.bracket_begin_count += 1
        }
        if (containsAll(token.scopes, ["string.quoted.other.lt-gt.include.c"],
            ["punctuation.definition.string.begin.c", "punctuation.definition.string.end.c"])) {
            const func_name = line.substring(token.startIndex, token.endIndex)
            retObj.global_include.push(func_name)
        }
        if (containsAll(token.scopes, ["string.quoted.double.include.c"],
            ["punctuation.definition.string.begin.c", "punctuation.definition.string.end.c"])) {
            const func_name = line.substring(token.startIndex, token.endIndex)
            retObj.local_include.push(func_name)
        }
        if (containsAll(token.scopes, ["punctuation.terminator.statement.c"])) {
            retObj.punctuation_terminator = true
        }

    }
    if (retObj.func_name !== "") {
        // 一行函数, 排除逗号结尾
        const token = lineTokens.tokens[lineTokens.tokens.length - 1]
        if (containsAll(token.scopes, ["punctuation.terminator.statement.c"], ["punctuation.separator.delimiter.c"])) {
            retObj.oneline_func = true
        } else if (containsAll(token.scopes, ["punctuation.section.block.end.bracket.curly.c"], ["punctuation.separator.delimiter.c"])) {
            retObj.oneline_func = true
        }
    }

    return retObj
}


const numCPUs = process.argv[2] || "20";
async function GetTextMateService(call, callback) {
    console.log(`pid:${worker.process.pid} start`)
    let scope = call.request.scope
    let textData = call.request.text

    // 对 textData，进行预处理
    // Replace single-line comments starting with //
    const singleLineCommentsRemoved = textData.replace(/\/\/(?![^\r\n]*["'])[^\r\n]*/gm, '');

    // Replace multi-line comments /* ... */
    const multiLineCommentsRemoved = singleLineCommentsRemoved.replace(/\/\*[\s\S]*?\*\//g, '');

    // Replace consecutive empty lines with a single empty line
    const emptyLinesRemoved = multiLineCommentsRemoved.replace(/^[\t ]*\n/gm, '');


    // 处理获取 cTage 标记，用来作为函数的断代参考
    const funcLineMap = await utils.getCTagsHandle(emptyLinesRemoved)
    // console.log(funcLineMap)

    // console.log(emptyLinesRemoved)

    const registry = registryMap[scope]
    if (!registry) {
        callback(null, { text: JSON.stringify({ text: "fail" }) });
    }

    const func_data = []
    const global_include = []
    const local_include = []
    // Load the JavaScript grammar and any other grammars included by it async.
    registry.loadGrammar(scope).then(grammar => {

        const text = emptyLinesRemoved.split(/\r\n|\r|\n/);
        let ruleStack = vsctm.INITIAL;

        let func_name = ""
        let func_static = false
        let func_start_line = -1
        let func_code_list = []
        let macro_list = []
        let ref_func_name_list = []
        let brace_count = 0
        let brace_flag = false
        let cTagobj = undefined

        for (let i = 0; i < text.length; i++) {
            const line = text[i];
            const lineTokens = grammar.tokenizeLine(line, ruleStack);
            let lineStats = null
            switch (scope) {
                case "source.cpp":
                    lineStats = handleLineTokensCpp(lineTokens, line)
                    break
                case "source.c":
                    lineStats = handleLineTokensC(lineTokens, line)
                    break
            }

            // 获取 ctags 的函数断代
            const cacheCTagobj = funcLineMap.get(i)
            if (cacheCTagobj !== undefined)
                cTagobj = cacheCTagobj
            if (cTagobj?.endLine < i + 1)
                cTagobj = undefined

            // 第一次匹配到函数名
            if (func_name === "") {
                if (lineStats.macro_name !== "") {
                    // 判断是否是 define, define 不处理 name
                    macro_list.push(lineStats.macro_name)

                    // 警告
                    if (cTagobj !== undefined && cTagobj?.funcName !== lineStats.macro_name) {
                        console.log("ctage 与 tmLanguag macro名不同：", i, cTagobj?.funcName, lineStats.macro_name)
                    }
                }
                else if (lineStats.func_name !== "") {
                    func_name = lineStats.func_name
                    func_static = lineStats.func_static
                    func_start_line = i
                    func_code_list = []
                    ref_func_name_list = []
                    brace_count = 0
                    brace_flag = false

                    // 警告
                    if (cTagobj !== undefined && cTagobj?.funcName !== lineStats.func_name) {
                        console.log("ctage 与 tmLanguag 函数名不同：", i+1, cTagobj?.funcName, lineStats.func_name)
                    }
                }
            }
            ref_func_name_list.push(...lineStats.ref_func_name_list)
            global_include.push(...lineStats.global_include)
            local_include.push(...lineStats.local_include)
            func_code_list.push(line)

            if (lineStats.bracket_begin_count > 0 ||
                lineStats.bracket_end_count > 0
            ) {
                brace_count += (lineStats.bracket_begin_count - lineStats.bracket_end_count)
                brace_flag = true
            }
            // cTagobj?.endLine === i+1 强制断代
            if (
                (brace_count === 0 && (brace_flag === true || lineStats.punctuation_terminator === true) && func_name !== "") ||
                lineStats.oneline_func ||
                (cTagobj?.endLine === i + 1 && cTagobj?.funcName === func_name)
            ) {
                func_line_count = i - func_start_line + 1
                func_data.push([func_name,
                    func_line_count,
                    code_str_count(func_code_list),
                    ref_func_name_list,
                    func_static])
                func_name = ""
                func_static = false
            }

            ruleStack = lineTokens.ruleStack;
        }
        if (func_name !== "") {
            func_line_count = text.length - func_start_line + 1
            func_data.push([func_name,
                func_line_count,
                code_str_count(func_code_list),
                ref_func_name_list,
                func_static])
        }
        callback(null, {
            text: JSON.stringify({
                func_data,
                macro_list,
                global_include,
                local_include
            })
        });
        workCount += 1
        console.log(`pid:${worker.process.pid} end, complete count: ${workCount}`)
    });


}

function main(address) {
    var server = new grpc.Server({
        'grpc.max_receive_message_length': 100 * 1024 * 1024, //  10MB
        'grpc.max_send_message_length': 100 * 1024 * 1024 //  10MB
    });
    console.log(`${worker.process.pid} start server:${address}`)
    server.addService(textMate_proto.TextMateService.service, { GetTextMatePlain: GetTextMateService });
    server.bindAsync(address, grpc.ServerCredentials.createInsecure(), () => {
        server.start();
    });
}


if (cluster.isMaster) {
    // Fork workers.
    for (let i = 0; i < Number(numCPUs); i++) {
        cluster.fork({ PORT: BasicPort + i });
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
    });
} else {
    // Workers can share any TCP connection
    // In this case it is an HTTP server
    const port = process.env.PORT;

    main(`${ServerAddress}:${port}`);
}