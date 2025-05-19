import os
import json
import time
from openai import OpenAI

# OpenAI API 클라이언트 초기화
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def validate_training_file(file_path):
    """학습 데이터 파일의 유효성 검사"""
    print(f"Validating training file: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        line_count = 0
        for line in f:
            line_count += 1
            try:
                # 각 줄이 유효한 JSON 형식인지 확인
                json_data = json.loads(line)
                
                # 필수 필드 확인
                if 'messages' not in json_data:
                    print(f"Error in line {line_count}: 'messages' field missing")
                    return False
                
                messages = json_data['messages']
                if not isinstance(messages, list) or len(messages) < 2:
                    print(f"Error in line {line_count}: 'messages' should be a list with at least 2 items")
                    return False
                
                # role과 content 필드 확인
                for msg in messages:
                    if 'role' not in msg or 'content' not in msg:
                        print(f"Error in line {line_count}: message missing 'role' or 'content'")
                        return False
                    
                    # role이 'user' 또는 'assistant'인지 확인
                    if msg['role'] not in ['user', 'assistant']:
                        print(f"Error in line {line_count}: 'role' must be 'user' or 'assistant'")
                        return False
                
            except json.JSONDecodeError:
                print(f"Error in line {line_count}: Invalid JSON format")
                return False
    
    print(f"Training file validated successfully with {line_count} examples")
    return True

def upload_training_file(file_path):
    """학습 데이터 파일을 OpenAI에 업로드"""
    print(f"Uploading training file to OpenAI: {file_path}")
    
    try:
        with open(file_path, 'rb') as f:
            response = client.files.create(
                file=f,
                purpose="fine-tune"
            )
        
        file_id = response.id
        print(f"File uploaded successfully. File ID: {file_id}")
        return file_id
    
    except Exception as e:
        print(f"Error uploading file: {str(e)}")
        return None

def create_fine_tuning_job(file_id, model="gpt-3.5-turbo", suffix="shb-faq-v1"):
    """Fine-tuning 작업 생성"""
    print(f"Creating fine-tuning job with file ID: {file_id}")
    
    try:
        response = client.fine_tuning.jobs.create(
            training_file=file_id,
            model=model,
            suffix=suffix
        )
        
        job_id = response.id
        print(f"Fine-tuning job created successfully. Job ID: {job_id}")
        return job_id
    
    except Exception as e:
        print(f"Error creating fine-tuning job: {str(e)}")
        return None

def get_fine_tuning_job_status(job_id):
    """Fine-tuning 작업 상태 확인"""
    try:
        response = client.fine_tuning.jobs.retrieve(job_id)
        return response
    
    except Exception as e:
        print(f"Error retrieving fine-tuning job status: {str(e)}")
        return None

def monitor_fine_tuning_job(job_id, check_interval=60):
    """Fine-tuning 작업 진행 상태 모니터링"""
    print(f"Monitoring fine-tuning job: {job_id}")
    print("This may take some time...")
    
    while True:
        status = get_fine_tuning_job_status(job_id)
        
        if not status:
            print("Failed to retrieve job status")
            return False
        
        print(f"Status: {status.status}, Elapsed time: {status.created_at}")
        
        if status.status == "succeeded":
            print("Fine-tuning job completed successfully!")
            print(f"Fine-tuned model: {status.fine_tuned_model}")
            return status.fine_tuned_model
        
        elif status.status == "failed":
            print(f"Fine-tuning job failed: {status.error}")
            return False
        
        time.sleep(check_interval)

def test_fine_tuned_model(model_id, test_prompt):
    """Fine-tuned 모델 테스트"""
    print(f"Testing fine-tuned model: {model_id}")
    print(f"Test prompt: '{test_prompt}'")
    
    try:
        response = client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": test_prompt}],
            temperature=0.3,
            max_tokens=500
        )
        
        response_text = response.choices[0].message.content
        print(f"Model response: {response_text}")
        return response_text
    
    except Exception as e:
        print(f"Error testing fine-tuned model: {str(e)}")
        return None

def main():
    """메인 함수"""
    training_file = "attached_assets/shb-faq-finetune.jsonl"
    base_model = "gpt-3.5-turbo"
    model_suffix = "shb-faq-v1"
    
    print(f"Starting fine-tuning process using {base_model}")
    
    # 1. 학습 데이터 파일 검증
    if not validate_training_file(training_file):
        print("Training file validation failed. Please fix the issues and try again.")
        return
    
    # 2. 학습 데이터 파일 업로드
    file_id = upload_training_file(training_file)
    if not file_id:
        print("Failed to upload training file.")
        return
    
    # 파일 상태가 '준비됨'이 될 때까지 대기
    print("Waiting for file to be processed...")
    time.sleep(30)  # 파일 처리 대기
    
    # 3. Fine-tuning 작업 생성
    job_id = create_fine_tuning_job(file_id, base_model, model_suffix)
    if not job_id:
        print("Failed to create fine-tuning job.")
        return
    
    # 4. Fine-tuning 작업 모니터링
    fine_tuned_model = monitor_fine_tuning_job(job_id)
    if not fine_tuned_model:
        print("Fine-tuning job monitoring failed.")
        return
    
    # 5. Fine-tuned 모델 테스트
    test_prompts = [
        "VPN 연결이 계속 끊깁니다",
        "회사 PC에서 USB 사용하는 방법",
        "IP 주소를 확인하는 방법 알려주세요",
        "보안 정책 요약 좀 알려주세요"
    ]
    
    for prompt in test_prompts:
        test_fine_tuned_model(fine_tuned_model, prompt)
    
    print("\nFine-tuning process completed successfully.")
    print(f"Your fine-tuned model ID: {fine_tuned_model}")
    print("\nExample curl command to use the model:")
    print(f"""
curl https://api.openai.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -d '{{
    "model": "{fine_tuned_model}",
    "messages": [
      {{"role": "user", "content": "VPN 접속 오류가 발생합니다."}}
    ],
    "temperature": 0.3
  }}'
""")

if __name__ == "__main__":
    main()