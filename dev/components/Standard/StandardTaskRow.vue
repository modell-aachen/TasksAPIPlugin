<template>
<div v-if="task" class="task-row">
    <div class="row-item" v-for="field in config.fields">
        <component v-bind:is="field.component.type+'-data-field'" :task="task" :config="field.component">
        </component>
    </div>
</div>
</template>


<script>
import TaskRowMixin from "../../mixins/TaskRowMixin.vue";
import ValueDataField from "./ValueDataField.vue";
import BadgeDataField from "./BadgeDataField.vue";
import TypeDataField from "./TypeDataField.vue";
import ComposedDataField from "./ComposedDataField.vue";
export default {
    mixins: [TaskRowMixin],
    props: ['config'],
    components : {
        ValueDataField,
        BadgeDataField,
        TypeDataField,
        ComposedDataField
    }
};
</script>

<style lang="sass">
.row-item {
    flex-grow: 1;
    flex-basis: 0;
}
</style>
