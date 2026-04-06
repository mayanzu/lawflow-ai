"""
异步任务管理器 - 支持UI优先响应的后台处理
管理OCR、AI分析等耗时任务的异步执行
"""
import json
import time
import threading
import uuid
from enum import Enum
from typing import Dict, Optional, Callable, Any
from dataclasses import dataclass, asdict
from concurrent.futures import ThreadPoolExecutor

class TaskStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class TaskType(Enum):
    OCR = "ocr"
    ANALYZE = "analyze"
    GENERATE = "generate"

@dataclass
class Task:
    id: str
    type: str
    status: str
    progress: int
    message: str
    file_id: str
    file_name: str
    created_at: float
    updated_at: float
    result: Optional[Dict] = None
    error: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "type": self.type,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "file_id": self.file_id,
            "file_name": self.file_name,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "result": self.result,
            "error": self.error,
        }

class AsyncTaskManager:
    def __init__(self, max_workers: int = 3):
        self.tasks: Dict[str, Task] = {}
        self._lock = threading.RLock()
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._running_tasks: Dict[str, threading.Event] = {}
        
    def create_task(self, task_type: TaskType, file_id: str, file_name: str) -> Task:
        """创建新任务"""
        task_id = f"task_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        
        with self._lock:
            task = Task(
                id=task_id,
                type=task_type.value,
                status=TaskStatus.PENDING.value,
                progress=0,
                message="等待处理...",
                file_id=file_id,
                file_name=file_name,
                created_at=time.time(),
                updated_at=time.time(),
            )
            self.tasks[task_id] = task
            return task
    
    def get_task(self, task_id: str) -> Optional[Task]:
        """获取任务状态"""
        with self._lock:
            return self.tasks.get(task_id)
    
    def update_task(self, task_id: str, **updates) -> Optional[Task]:
        """更新任务状态"""
        with self._lock:
            task = self.tasks.get(task_id)
            if not task:
                return None
            
            for key, value in updates.items():
                if hasattr(task, key):
                    setattr(task, key, value)
            
            task.updated_at = time.time()
            return task
    
    def cancel_task(self, task_id: str) -> bool:
        """取消任务"""
        with self._lock:
            task = self.tasks.get(task_id)
            if not task:
                return False
            
            if task.status in [TaskStatus.COMPLETED.value, TaskStatus.FAILED.value]:
                return False
            
            # 设置取消标志
            if task_id in self._running_tasks:
                self._running_tasks[task_id].set()
            
            task.status = TaskStatus.CANCELLED.value
            task.message = "已取消"
            task.updated_at = time.time()
            return True
    
    def delete_task(self, task_id: str) -> bool:
        """删除任务"""
        with self._lock:
            if task_id in self.tasks:
                self.cancel_task(task_id)
                del self.tasks[task_id]
                return True
            return False
    
    def get_all_tasks(self) -> list:
        """获取所有任务"""
        with self._lock:
            return [task.to_dict() for task in sorted(
                self.tasks.values(), 
                key=lambda t: t.created_at, 
                reverse=True
            )]
    
    def get_active_tasks(self) -> list:
        """获取进行中的任务"""
        with self._lock:
            return [task.to_dict() for task in self.tasks.values() 
                    if task.status in [TaskStatus.PENDING.value, TaskStatus.PROCESSING.value]]
    
    def submit_task(self, task_id: str, task_func: Callable, *args, **kwargs) -> bool:
        """提交任务到线程池执行"""
        task = self.get_task(task_id)
        if not task:
            return False
        
        # 创建取消事件
        cancel_event = threading.Event()
        with self._lock:
            self._running_tasks[task_id] = cancel_event
        
        # 提交到线程池
        future = self._executor.submit(self._wrap_task, task_id, cancel_event, task_func, *args, **kwargs)
        return True
    
    def _wrap_task(self, task_id: str, cancel_event: threading.Event, task_func: Callable, *args, **kwargs):
        """包装任务执行，处理状态更新"""
        try:
            # 更新为处理中状态
            self.update_task(
                task_id, 
                status=TaskStatus.PROCESSING.value,
                message="处理中...",
                progress=10
            )
            
            # 执行实际任务
            result = task_func(cancel_event=cancel_event, *args, **kwargs)
            
            # 检查是否被取消
            if cancel_event.is_set():
                self.update_task(
                    task_id,
                    status=TaskStatus.CANCELLED.value,
                    message="已取消"
                )
                return
            
            # 更新为完成状态
            self.update_task(
                task_id,
                status=TaskStatus.COMPLETED.value,
                message="处理完成",
                progress=100,
                result=result
            )
            
        except Exception as e:
            # 更新为失败状态
            self.update_task(
                task_id,
                status=TaskStatus.FAILED.value,
                message="处理失败",
                error=str(e)
            )
        finally:
            # 清理
            with self._lock:
                if task_id in self._running_tasks:
                    del self._running_tasks[task_id]
    
    def cleanup_old_tasks(self, max_age_hours: int = 24):
        """清理旧任务"""
        cutoff = time.time() - (max_age_hours * 3600)
        with self._lock:
            to_delete = [
                task_id for task_id, task in self.tasks.items()
                if task.created_at < cutoff and task.status in [
                    TaskStatus.COMPLETED.value,
                    TaskStatus.FAILED.value,
                    TaskStatus.CANCELLED.value
                ]
            ]
            for task_id in to_delete:
                del self.tasks[task_id]
    
    def shutdown(self):
        """关闭任务管理器"""
        # 取消所有进行中的任务
        with self._lock:
            for task_id in list(self._running_tasks.keys()):
                self.cancel_task(task_id)
        
        # 关闭线程池
        self._executor.shutdown(wait=True)


# 全局任务管理器实例
task_manager = AsyncTaskManager(max_workers=3)


# 任务进度回调工具
class ProgressCallback:
    """用于在任务执行过程中更新进度"""
    
    def __init__(self, task_manager: AsyncTaskManager, task_id: str):
        self.task_manager = task_manager
        self.task_id = task_id
        self.cancel_event = task_manager._running_tasks.get(task_id)
    
    def is_cancelled(self) -> bool:
        """检查任务是否被取消"""
        return self.cancel_event.is_set() if self.cancel_event else False
    
    def update(self, progress: int, message: str):
        """更新进度"""
        if self.is_cancelled():
            raise InterruptedError("Task cancelled")
        
        self.task_manager.update_task(
            self.task_id,
            progress=progress,
            message=message
        )
    
    def step(self, step_name: str, progress: int):
        """更新步骤进度"""
        self.update(progress, f"正在{step_name}...")


# 使用示例和测试
if __name__ == "__main__":
    # 测试代码
    def sample_task(cancel_event: threading.Event, duration: int = 5):
        """示例任务"""
        for i in range(duration):
            if cancel_event.is_set():
                print("Task cancelled")
                return None
            print(f"Processing... {i+1}/{duration}")
            time.sleep(1)
        return {"result": "success", "data": "sample data"}
    
    # 创建任务
    task = task_manager.create_task(TaskType.OCR, "file_123", "test.pdf")
    print(f"Created task: {task.id}")
    
    # 提交任务
    task_manager.submit_task(task.id, sample_task, 5)
    
    # 轮询状态
    while True:
        current = task_manager.get_task(task.id)
        print(f"Status: {current.status}, Progress: {current.progress}%, Message: {current.message}")
        
        if current.status in [TaskStatus.COMPLETED.value, TaskStatus.FAILED.value, TaskStatus.CANCELLED.value]:
            break
        
        time.sleep(0.5)
    
    print(f"Final result: {current.result}")
    task_manager.shutdown()
