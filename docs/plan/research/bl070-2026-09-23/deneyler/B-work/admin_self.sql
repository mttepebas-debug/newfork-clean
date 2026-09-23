select 'role of user2', role from public.workspace_memberships where user_id='15200000-0000-4000-8000-000000000002';
select public.save_employee_document_draft_file_service('15200000-0000-4000-8000-000000000002','65200000-0000-4000-8000-000000000001',1,
 '25200000-0000-4000-8000-000000000001/45200000-0000-4000-8000-000000000001/65200000-0000-4000-8000-000000000001/75200000-0000-4000-8000-000000000001.pdf','one.pdf','application/pdf',100);
select public.submit_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000002','65200000-0000-4000-8000-000000000001',2,
 (select id from public.employee_document_submissions where requirement_id='65200000-0000-4000-8000-000000000001' and state='draft'),current_date+30,'{}');
do $$ begin perform public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',3,
 (select submitted_document_id from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),'approve','','full',
 (select jsonb_agg(jsonb_build_object('id',file_id,'decision','keep')) from public.employee_document_submission_files)); raise notice 'ADMIN APPROVED OWN DOCUMENT'; exception when others then raise notice 'self-approve refused: % %',sqlstate,sqlerrm; end $$;
select 'state', app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001';
