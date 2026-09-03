# ocr 图片识别接口（插件端）
识别图片文字
POST
/medical/pluginRuntime/ocr
识别图片文字
访问权限

> 权限策略：忽略权限检查
请求参数
Query 参数
bizType
string 
可选
业务类型（可空，如 admission_record）
bizId
string 
业务主键（可空）
可选
engine
string 
可选
识别引擎（可空）：baidu 百度OCR（默认）/ vlm 大模型多模态识别（llm 为别名）
Body 参数multipart/form-data
file
file 
必需
图片文件（jpg/jpeg/png/bmp）
请求示例代码
返回响应
🟢200
*/*
识别全文与分块；vlm 无坐标，blocks[].location 为 null
Body*/*
响应信息主体
code
integer <int32>
可选
msg
string 
可选
data
object 
(OcrRecognizeResult)
OcrRecognizeResult
可选
OCR 识别结果（插件端返回值）
ocrId
integer <int64>
可选
审计记录ID（biz_ocr_result.id）
text
string 
可选
识别全文（按行换行拼接）
blocks
array[object (OcrBlock)] 
可选
文本块列表（含坐标），前端做高亮定位用；大模型识别无坐标，location 为 null
engine
string 
可选
实际使用的识别引擎（baidu/vlm）
fileName
string 
原始文件名
可选
fileUrl
string 
原图访问地址
可选
costMs
integer <int64>
识别耗时（毫秒）
可选
status
string 
可选
状态（success/failed）
示例
{
    "code": 0,
    "msg": "string",
    "data": {
        "ocrId": 0,
        "text": "string",
        "blocks": [
            {
                "words": "string",
                "location": {
                    "left": 0,
                    "top": 0,
                    "width": 0,
                    "height": 0
                }
            }
        ],
        "engine": "string",
        "fileName": "string",
        "fileUrl": "string",
        "costMs": 0,
        "status": "string"
    }
}


图片识别接口（插件端）
查询当前患者已上传/已识别的资料列表（插件端）
GET
/medical/pluginRuntime/ocr/records
查询当前患者已上传/已识别的资料列表（插件端）

按创建时间倒序返回，不含原始响应JSON。

访问权限

> **权限策略**：忽略权限检查
请求参数
Query 参数
bizId
string 
必需
业务主键（患者ID/就诊号）
bizType
string 
可选
业务类型（可空，如 admission_record）



# 又重新优化了一下，上传外院资料这个界面的接口，之前那个 /medical/admin/ocr/{id}  /medical/admin/ocr/list 是错误的，应该按照上面的接口查询。