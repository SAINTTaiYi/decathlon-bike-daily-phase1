-- Keep billing reminder semantics after repair completion and allow direct editing in Pending Pickup.

alter table bike_ops.repair_details
  drop constraint if exists repair_details_repair_status_check;

alter table bike_ops.repair_details
  add constraint repair_details_repair_status_check check (repair_status in (
    '维修中', '等待配件',
    '已开付款单', '已开维修单', '已开质保维修单', '已开质保付款单-请过机', '快速服务免费',
    '维修完成-已开付款单', '维修完成-已开维修单', '维修完成-已开质保维修单',
    '维修完成-已开质保付款单-请过机', '维修完成-快速服务免费',
    '已开质保单', '维修完成', '已完成'
  )) not valid;

update bike_ops.repair_details r
set repair_status = case
  when w.kind = 'pickup' and w.lifecycle = 'active' and p.pickup_source = 'repair' then
    case
      when r.repair_status = '已开付款单' then '维修完成-已开付款单'
      when r.repair_status in ('已开质保单', '已开质保维修单') then '维修完成-已开质保维修单'
      when r.repair_status = '已开质保付款单-请过机' then '维修完成-已开质保付款单-请过机'
      when r.repair_status = '快速服务免费' or r.repair_type = '免费' then '维修完成-快速服务免费'
      when r.repair_type = '质保' then '维修完成-已开质保维修单'
      else '维修完成-已开维修单'
    end
  when r.repair_status = '已开质保单' then '已开质保维修单'
  else r.repair_status
end
from bike_ops.work_items w
left join bike_ops.pickup_details p on p.work_item_id = w.id
where w.id = r.work_item_id;

update bike_ops.work_items w
set status = r.repair_status
from bike_ops.repair_details r
join bike_ops.pickup_details p on p.work_item_id = r.work_item_id and p.pickup_source = 'repair'
where w.id = r.work_item_id
  and w.kind = 'pickup'
  and w.lifecycle = 'active';

alter table bike_ops.repair_details
  validate constraint repair_details_repair_status_check;
