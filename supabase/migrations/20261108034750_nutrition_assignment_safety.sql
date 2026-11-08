-- Nutrition-only templates must never introduce their placeholder workout days.
do $$ declare definition text; begin
 select pg_get_functiondef('private.management_command(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'base jsonb; old jsonb;','base jsonb; old jsonb; base_name text;');
 definition:=replace(definition,'base:=t.content;','base:=t.content; base_name:=null;');
 definition:=replace(definition,'select content into base from public.programs','select content,name into base,base_name from public.programs');
 definition:=replace(definition,$old$base:=jsonb_set(coalesce(base,t.content),'{nutrition}',t.content->'nutrition');$old$,$new$if base is null then raise exception 'قالب التغذية يحتاج برنامجًا قائمًا. أضف برنامجًا أو سجّل أهداف التغذية من ملف العميل أولًا'; end if; base:=jsonb_set(base,'{nutrition}',t.content->'nutrition');$new$);
 definition:=replace(definition,$old$'name',t.name,'content',base$old$,$new$'name',coalesce(base_name,t.name),'content',base$new$);
 execute definition;
end $$;
