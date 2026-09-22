-- app_private.default_closure_period() was written this morning without a
-- fixed search_path, and the hosted security advisor flags every function
-- like that (function_search_path_mutable). The body names no object at all --
-- it returns fourteen days -- so an empty path changes nothing it does and
-- takes it off the list.
alter function app_private.default_closure_period() set search_path = '';
