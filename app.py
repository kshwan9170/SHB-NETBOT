import os
from flask import Flask, render_template, request, jsonify
import openai
from openai import OpenAI

app = Flask(__name__)

# OpenAI API 키 설정
openai_api_key = os.environ.get("OPENAI_API_KEY")
client = OpenAI(api_key=openai_api_key)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return app.send_static_file(path)

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json()
    user_message = data.get('message', '')
    
    if not user_message:
        return jsonify({'error': '메시지가 비어 있습니다.'}), 400
    
    try:
        # OpenAI API를 호출하여 응답 생성
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "너는 신한은행 네트워크 전문가로서 정확하고 친절하게 답변해줘"},
                {"role": "user", "content": user_message}
            ],
            max_tokens=500,
            temperature=0.7,
        )
        
        # API 응답에서 텍스트 추출
        reply = response.choices[0].message.content
        
        return jsonify({'reply': reply})
    
    except Exception as e:
        print(f"Error in chat API: {str(e)}")
        return jsonify({'error': f'오류가 발생했습니다: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)