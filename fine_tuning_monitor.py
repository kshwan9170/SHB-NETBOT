import os
import time
import argparse
from openai import OpenAI

# OpenAI API 클라이언트 초기화
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

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
    print("This may take some time (typically 1-2 hours for completion)...")
    
    start_time = time.time()
    
    while True:
        status = get_fine_tuning_job_status(job_id)
        
        if not status:
            print("Failed to retrieve job status")
            return False
        
        elapsed_time = time.time() - start_time
        hours, remainder = divmod(elapsed_time, 3600)
        minutes, seconds = divmod(remainder, 60)
        
        print(f"Status: {status.status}, Elapsed time: {int(hours)}h {int(minutes)}m {int(seconds)}s")
        
        if status.status == "succeeded":
            print("\n✅ Fine-tuning job completed successfully!")
            print(f"Fine-tuned model: {status.fine_tuned_model}")
            
            # 모델 ID를 config.py에 업데이트하는 방법 안내
            print("\n▶ To use this model, update your config.py file:")
            print(f"""
# Fine-tuned 모델 설정
FINE_TUNED_MODEL = {{
    "enabled": True,
    "model_id": "{status.fine_tuned_model}",  # 업데이트된 모델 ID
    "temperature": 0.3,
    "max_tokens": 500
}}
            """)
            return status.fine_tuned_model
        
        elif status.status == "failed":
            print(f"\n❌ Fine-tuning job failed: {status.error}")
            return False
        
        # 세부 정보 출력
        if hasattr(status, 'training_file'):
            print(f"Training file: {status.training_file}")
        
        if hasattr(status, 'trained_tokens'):
            print(f"Trained tokens: {status.trained_tokens}")
        
        print("-" * 50)
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
    parser = argparse.ArgumentParser(description="Monitor OpenAI Fine-tuning Progress")
    parser.add_argument('--job_id', type=str, help='Fine-tuning job ID to monitor')
    parser.add_argument('--interval', type=int, default=60, help='Check interval in seconds (default: 60)')
    parser.add_argument('--test', action='store_true', help='Test the model after completion')
    
    args = parser.parse_args()
    
    if not args.job_id:
        print("Please provide a job ID using --job_id parameter")
        return
    
    model_id = monitor_fine_tuning_job(args.job_id, args.interval)
    
    if model_id and args.test:
        print("\n🧪 Testing the fine-tuned model...")
        test_prompts = [
            "VPN 연결이 계속 끊깁니다",
            "회사 PC에서 USB 사용하는 방법",
            "IP 주소를 확인하는 방법 알려주세요",
            "보안 정책 요약 좀 알려주세요"
        ]
        
        for prompt in test_prompts:
            print("\n" + "-" * 30)
            test_fine_tuned_model(model_id, prompt)
            print("-" * 30)

if __name__ == "__main__":
    main()