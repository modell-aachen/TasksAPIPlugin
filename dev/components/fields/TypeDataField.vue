<template>
<div>
<span v-bind:class='classes'>{{value}}</span>
</div>
</template>


<script>
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
export default {
    mixins: [DataFieldMixin],
    computed: {
        classes(){
            return this.task.fields["Type"].value.toLowerCase() + "-status";
        },
        value(){
            return this.task.fields["Type"].value;
        }
    }
};
</script>

<style lang="sass">
.task-status {
    background-color: #5cb85c;
}
.information-status {
    background-color: #337ab7;
}
.decision-status {
    background-color: #f0ad4e;
}
</style>
