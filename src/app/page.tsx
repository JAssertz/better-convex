import { TodoList } from '@/components/todos/todo-list';

export default async function HomePage() {
  return (
    <div className="mx-auto max-w-3xl @3xl:px-8 px-6 @3xl:py-12 py-8">
      <TodoList />
    </div>
  );
}
